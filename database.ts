/*jshint esversion: 8 */
/*jslint node: true */

import mysql, { Query, queryCallback } from 'mysql';

//var mysql = require('mysql');

import request from 'request';
import util from 'util';

//var request = require('request');
//var util = require('util');

interface ExtConnection extends mysql.Connection {
    origQuery: mysql.QueryFunction;
}
let _db: ExtConnection;

class UnixDate extends Date {
    static unixTime() {
        return new UnixDate().getTime() / 1000 | 0;
    }
}

function handleDisconnect() {
    let connection = mysql.createConnection({
        //        host: 'proliant.home.vchrist.at',
        host: '192.168.1.3',
        user: 'wastecalendar',
        password: '!!!SoMaSi01!!!'
    });

    _db = Object.assign({}, connection, {origQuery: connection.query});

    _db.connect(function onConnect(err) {
        if (err) {
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 1000);
        } else {
            console.log('MySQL Connected!');
        }
    });

    _db.query = function (sql: string, values: any, cb: mysql.queryCallback): mysql.Query {
        console.log('Query start: ' + sql);
        if (!cb) {
            cb = values;
            values = null;
        }
        return _db.origQuery(sql, values, function (err, result) {
            console.log('Query end');
            if (err) {
                console.error(err.stack);
                setTimeout(handleDisconnect, 1000);
            }
            cb(err, result);
        });
    } as mysql.QueryFunction;

    _db.on('error', function (error) {
        console.log('On Error: ' + error);
        if (!error.fatal) return;
        if (error.code !== 'PROTOCOL_CONNECTION_LOST' && error.code !== 'PROTOCOL_PACKETS_OUT_OF_ORDER' && error.code !== 'ECONNREFUSED') throw error;

        console.log('> Re-connecting lost MySQL connection: ' + error.stack);

        setTimeout(handleDisconnect, 1000);
    });
}

handleDisconnect();

function db() {
    return _db;
}

interface QueryCallback {
    (err: any, result: any) : void;
}

function queryUser(oc_userid: string | QueryCallback, cb?: QueryCallback) {
    if (!cb) {
        var cb: QueryCallback | undefined = oc_userid as QueryCallback;
        oc_userid = '%';
    }

    if (_db.state === 'disconnected') {
        return cb('Error: Database not connected', null);
    }

    var sql = 'SELECT * FROM wastecalendar.oc_user WHERE ' + (oc_userid ? 'oc_userid LIKE \'' + oc_userid + '\'' : 'TRUE');

    console.log('SQL: ' + sql);

    _db.query(sql, function (err, result) {
        if (err) {
            cb(err, null);
        } else if (result && result.length) {
            console.log(result.length + ' user found [' + result.map((row: { oc_userid: any; }) => row.oc_userid).toString() + ']');
            cb(null, result);
        } else {
            cb('No User Found', null);
        }
    });
}

function queryAmzUser(oc_userid: string, amz_skillid: string, cb: queryCallback) {
    var sql = 'SELECT u.amz_userid, u.amz_permissions, u.amz_apiendpoint, u.oc_userid, e.amzep_accesstoken, e.amzep_expires FROM wastecalendar.amz_user u LEFT OUTER JOIN wastecalendar.amz_endpoint e ON u.amz_skillid = e.amzep_skillid WHERE u.oc_userid = ? AND u.amz_skillid = ?';

    console.log('AMZ: Looking for access-token for skill \'' + amz_skillid + '\' and user \'' + oc_userid + '\'');

    _db.query(sql, [oc_userid, amz_skillid], function (err, result) {
        cb(err, result);
    });
}

interface AmzUser {
    skillId: string;
    userid: string;
    permission: number;
    endpoint: string;
    ocUserId: string;
    token: string;
    expires: Date;
    expired: boolean;
};

function promiseQueryAmzUser(amz_skillid: string, oc_userid: string) {
    return new Promise(function (reslove, reject) {
        queryAmzUser(oc_userid, amz_skillid, function (err: any, result) {
            if (err) {
                console.log('Error: ' + err);
                reject(err);
            } else if (!result || !result.length) {
                reslove(null);
            } else {
                let amzUser: AmzUser = {
                    skillId: amz_skillid,
                    userid: result[0].amz_userid,
                    permission: result[0].amz_permissions,
                    endpoint: result[0].amz_apiendpoint,
                    ocUserId: result[0].oc_userid,
                    token: result[0].amzep_accesstoken,
                    expires: result[0].amzep_expires,
                    expired: (result[0].amzep_expires.toUnixTime() - UnixDate.unixTime()) < 600

                }
                reslove(amzUser);
            }
        });
    });
}

function proactiveEndpointTokenUpdate(amzSkillId: string, bodyJson: { access_token: any; expires_in: any; }, cb: { (err: mysql.MysqlError | null, res: any): void}) {
    var amzUpdateToken = {
        amzep_accesstoken: bodyJson.access_token,
        amzep_expires: new Date((UnixDate.unixTime() + bodyJson.expires_in) * 1000)
    };
    var amzUpdateTokenCond = {
        amzep_skillid: amzSkillId
    };

    console.log('AMZ: Got updated access token for skill \'' + amzSkillId + '\': ' + amzUpdateToken.amzep_expires + ' - ' + amzUpdateToken.amzep_accesstoken);

    var sql = 'UPDATE wastecalendar.amz_endpoint SET ? WHERE ?';

    _db.query(sql, [amzUpdateToken, amzUpdateTokenCond], function (err, updateResult) {
        if (!err) {
            console.log(updateResult.affectedRows + ' records updated ');
            cb(err, {
                token: amzUpdateToken.amzep_accesstoken,
                expires: amzUpdateToken.amzep_expires,
                expired: (+amzUpdateToken.amzep_expires / 1000 - UnixDate.unixTime()) < 600
            });
        } else {
            console.error(err);
            cb(err, null);
        }
    });
}

function amzProactiveEndpointTokenUpdate(amzSkillId: string, cb: {(err: mysql.MysqlError | null, token: any): void}) {
    var options = {
        method: 'POST',
        url: 'https://api.amazon.com/auth/o2/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        form: {
            grant_type: 'client_credentials',
            client_id: 'amzn1.application-oa2-client.c1494a447d77405883037efdc06baad6',
            client_secret: '07c7affba53c9d2632186cff30c678d5ed243efc6140436c533f2eac32e8dd11',
            scope: 'alexa::proactive_events'
        }
    };

    request(options, function (error, response, body) {
        if (error) {
            console.error(error);
            return cb(error, null);
        } else {
            var bodyJson = JSON.parse(body);

            proactiveEndpointTokenUpdate(amzSkillId, bodyJson, function (err, token) {
                cb(err, token);
            });
        }
    });
}

function promiseAmzEndpointTokenUpdate(amzSkillId: string) {
    return new Promise(function (resolve, reject) {
        amzProactiveEndpointTokenUpdate(amzSkillId, function (err, token) {
            if (err) {
                reject(err);
            } else {
                resolve(token);
            }
        });
    });
}

interface AmazonToken {
    token: string,
    expires: Date,
    expired: boolean
}

function proactiveEndpointTokenInsert(amzSkillId: string, bodyJson: { access_token: any; expires_in: any; }, cb: Function) {
    var amzInsertToken = {
        amzep_skillid: amzSkillId,
        amzep_accesstoken: bodyJson.access_token,
        amzep_expires: new Date((UnixDate.unixTime() + bodyJson.expires_in - 600) * 1000)
    };

    var sql = 'INSERT INTO wastecalendar.amz_endpoint SET ?';

    _db.query(sql, amzInsertToken, function (err, result) {
        let amazonToken: AmazonToken | null = null; 

        if (!err) {
            console.log(result.affectedRows + ' records inserted ');
            amazonToken =  {
                token: amzInsertToken.amzep_accesstoken,
                expires: amzInsertToken.amzep_expires,
                expired: (+amzInsertToken.amzep_expires / 1000 - UnixDate.unixTime()) < 600
            };
        }
        cb(err, amazonToken);
    });
}

function amzProactiveEndpointTokenInsert(amzSkillId: string, cb: { (err: mysql.MysqlError | null, token: AmazonToken | null): void; }) {
    var options = {
        method: 'POST',
        url: 'https://api.amazon.com/auth/o2/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        form: {
            grant_type: 'client_credentials',
            client_id: 'amzn1.application-oa2-client.c1494a447d77405883037efdc06baad6',
            client_secret: '07c7affba53c9d2632186cff30c678d5ed243efc6140436c533f2eac32e8dd11',
            scope: 'alexa::proactive_events'
        }
    };

    request(options, function (error, response, body) {
        if (error) {
            console.error(error);
            return cb(error, null);
        } else {
            var bodyJson = JSON.parse(body);

            proactiveEndpointTokenInsert(amzSkillId, bodyJson, function (err: mysql.MysqlError | null, token: AmazonToken | null) {
                cb(err, token);
            });
        }
    });
}

function promiseAmzEndpointTokenInsert(amzSkillId: string) {
    return new Promise(function (resolve, reject) {
        amzProactiveEndpointTokenInsert(amzSkillId, function (err, token) {
            if (err) {
                reject(err);
            } else {
                resolve(token);
            }
        });
    });
}

function insertUser(user: { data: { user_id: string; }; accessToken: any; refreshToken: any; expires: any; }, cb: Function) {
    console.log('AUTH: Create account for user ' + user.data.user_id);

    var sql = 'INSERT INTO wastecalendar.oc_user SET ?';

    var ocUser = {
        oc_userid: user.data.user_id,
        oc_accessToken: user.accessToken,
        oc_refreshtoken: user.refreshToken,
        oc_expires: user.expires
    };

    _db.query(sql, ocUser, function (err, result) {
        if (!err) {
            console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
        }
        return cb(err);
    });
}

function updateUserToken(user: { data: { user_id: string; }; accessToken: any; refreshToken: any; expires: any; }, cb: Function) {
    var updatedToken = [
        // new values
        {
            oc_accesstoken: user.accessToken,
            oc_refreshtoken: user.refreshToken,
            oc_expires: user.expires
        },
        // condition
        {
            oc_userid: user.data.user_id
        }
    ];

    var sql_UpdateToken = 'UPDATE wastecalendar.oc_user SET ? WHERE ?';

    _db.query(sql_UpdateToken, updatedToken, function (err, result) {
        if (!err) {
            console.log(result.affectedRows + ' record updated');
        }

        cb(err);
    });
}

function deleteUser(user_id: string, cb: Function) {
    var sql = `DELETE FROM wastecalendar.oc_user WHERE oc_userid = ${_db.escape(user_id)}`;

    _db.query(sql, function (err, result) {
        if (!err) {
            console.log(result.affectedRows + ' record updated');
        }
        cb(err);
    });
}

export {
    db,
    queryUser,
    promiseQueryAmzUser,
    promiseAmzEndpointTokenUpdate,
    promiseAmzEndpointTokenInsert,
    insertUser,
    deleteUser,
    updateUserToken
}
