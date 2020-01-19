/*jshint esversion: 8 */
/*jslint node: true */

var mysql = require('mysql');
var util = require('util');
var request = require('request');

var _db;

function handleDisconnect() {
    _db = mysql.createConnection({
        //        host: 'proliant.home.vchrist.at',
        host: '192.168.1.3',
        user: 'wastecalendar',
        password: '!!!SoMaSi01!!!'
    });

    _db.connect(function onConnect(err) {
        if (err) {
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 1000);
        } else {
            console.log('MySQL Connected!');
        }
    });

    _db.origQuery = _db.query;

    _db.query = function (sql, values, cb) {
        console.log('Query start: ' + sql);
        if (!cb) {
            cb = values;
            values = null;
        }
        _db.origQuery(sql, values, function (err, result) {
            console.log('Query end');
            if (err) {
                console.error(err.stack);
                setTimeout(handleDisconnect, 1000);
            }
            cb(err, result);
        });
    };

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

function queryUser(oc_userid, cb) {
    if (!cb) {
        cb = oc_userid;
        oc_userid = '%';
    }

    if (_db.state === 'disconnected') {
        return cb('Error: Database not connected', null);
    }

    var sql = 'SELECT * FROM wastecalendar.oc_user WHERE ' + (oc_userid ? 'oc_userid LIKE \'' + oc_userid + '\'' : 'TRUE');

    console.log('SQL: ' + sql);

    _db.query(sql, function (err, result) {
        if (err) {
            return cb(err, null);
        } else {
            return cb(null, result);
        }
    });
}

function queryAmzUser(oc_userid, amz_skillid, cb) {
    var sql = 'SELECT u.amz_userid, u.amz_permissions, u.amz_apiendpoint, u.oc_userid, e.amzep_accesstoken, e.amzep_expires FROM wastecalendar.amz_user u LEFT OUTER JOIN wastecalendar.amz_endpoint e ON u.amz_skillid = e.amzep_skillid WHERE u.oc_userid = ? AND u.amz_skillid = ?';

    console.log('AMZ: Looking for access-token for skill \'' + amz_skillid + '\' and user \'' + oc_userid + '\'');

    db().query(sql, [oc_userid, amz_skillid], function (err, result) {
        cb(err, result);
    });
}

function promiseQueryAmzUser(amz_skillid, oc_userid) {
    return new Promise(function (reslove, reject) {
        queryAmzUser(oc_userid, amz_skillid, function(err, result) {
            if (err) {
                console.log('Error: ' + err);
                reject(err);
            } else if (!result || !result.length) {
                resolve(null);
            } else {
                var amzUser = {};
                if (result && result.length) {
                    amzUser.skillId = amz_skillid;
                    amzUser.userid = result[0].amz_userid;
                    amzUser.permission = result[0].amz_permissions;
                    amzUser.endpoint = result[0].amz_apiendpoint;
                    amzUser.ocUserId = result[0].oc_userid;
                    amzUser.token = result[0].amzep_accesstoken;
                    amzUser.expires = result[0].amzep_expires;
                    amzUser.expired = (result[0].amzep_expires.toUnixTime() - Date.unixTime()) < 600;
                }
                reslove(amzUser);
            }
        });
    });
}

function proactiveEndpointTokenUpdate(amzSkillId, bodyJson, cb) {
    var amzUpdateToken = {
        amzep_accesstoken: bodyJson.access_token,
        amzep_expires: new Date((Date.unixTime() + bodyJson.expires_in) * 1000)
    };
    var amzUpdateTokenCond = {
        amzep_skillid: amzSkillId
    };

    console.log('AMZ: Got updated access token for skill \'' + amzSkillId + '\': ' + amzUpdateToken.amzep_expires + ' - ' + amzUpdateToken.amzep_accesstoken);

    var sql = 'UPDATE wastecalendar.amz_endpoint SET ? WHERE ?';

    db().query(sql, [amzUpdateToken, amzUpdateTokenCond], function (err, updateResult) {
        if (!err) {
            console.log(updateResult.affectedRows + ' records updated ');
            cb(err, {
                token: amzUpdateToken.amzep_accesstoken,
                expires: amzUpdateToken.amzep_expires,
                expired: (amzUpdateToken.amzep_expires.toUnixTime() - Date.unixTime()) < 600
            });
        } else {
            console.error(err);
            cb(err, null);
        }
    });
}

function amzProactiveEndpointTokenUpdate(amzSkillId, cb) {
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

function promiseAmzEndpointTokenUpdate(amzSkillId) {
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

function proactiveEndpointTokenInsert(amzSkillId, bodyJson, cb) {
    var amzInsertToken = {
        amzep_skillid: amzSkillId,
        amzep_accesstoken: bodyJson.access_token,
        amzep_expires: new Date((Date.unixTime() + bodyJson.expires_in - 600) * 1000)
    };

    var sql = 'INSERT INTO wastecalendar.amz_endpoint SET ?';

    db().query(sql, amzInsertToken, function (err, result) {
        if (!err) {
            console.log(result.affectedRows + ' records inserted ');
        }
        if (!err) {
            console.log(updateResult.affectedRows + ' records inserted ');
            cb(err, {
                token: amzInsertToken.amzep_accesstoken,
                expires: amzInsertToken.amzep_expires,
                expired: (amzInsertToken.amzep_expires.toUnixTime() - Date.unixTime()) < 600
            });
        } else {
            console.error(err);
            cb(err, null);
        }
    });
}

function amzProactiveEndpointTokenInsert(amzSkillId, cb) {
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

            proactiveEndpointTokenInsert(amzSkillId, bodyJson, function (err, token) {
                cb(err, token);
            });
        }
    });
}

function promiseAmzEndpointTokenInsert(amzSkillId) {
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

function updateUserToken(user, cb) {
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

module.exports = {
    db,
    queryUser,
    promiseQueryAmzUser,
    promiseAmzEndpointTokenUpdate,
    promiseAmzEndpointTokenInsert,
    updateUserToken
};