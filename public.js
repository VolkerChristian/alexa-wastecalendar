#!/usr/bin/node

/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

const express = require('express');
var util = require('util');
var request = require('request');
var mysql = require('mysql');
var nextcloudAuth = require(__dirname + '/ncoauth2');
var {
    db
} = require(__dirname + '/database.js');

/*
var db;

function handleDisconnect() {
    db = mysql.createConnection({
        //        host: 'proliant.home.vchrist.at',
        host: '192.168.1.3',
        user: 'wastecalendar',
        password: '!!!SoMaSi01!!!'
    });

    db.connect(function onConnect(err) {
        if (err) {
//            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 1000);
        } else {
            console.log('MySQL Connected!');
        }
    });

    db.origQuery = db.query;

    db.query = function (sql, values, cb) {
        console.log('Query start: ' + sql);
        if (!cb) {
            cb = values;
            values = null;
        }
        db.origQuery(sql, values, function (err, result) {
            console.log('Query end');
            if (err) {
                console.error(err.stack);
                setTimeout(handleDisconnect, 1000);
            }
            cb(err, result);
        });
    };

    db.on('error', function (error) {
        console.log('On Error: ' + error);
        if (!error.fatal) return;
        if (error.code !== 'PROTOCOL_CONNECTION_LOST' && error.code !== 'PROTOCOL_PACKETS_OUT_OF_ORDER' && error.code !== 'ECONNREFUSED') throw error;

        console.log('> Re-connecting lost MySQL connection: ' + error.stack);

        setTimeout(handleDisconnect, 1000);
    });
}

handleDisconnect();
*/

function insertUser(user, cb) {
    console.log('AUTH: Create account for user ' + user.data.user_id);

    var sql = 'INSERT INTO wastecalendar.oc_user SET ?';

    var ocUser = {
        oc_userid: user.data.user_id,
        oc_accessToken: user.accessToken,
        oc_refreshtoken: user.refreshToken,
        oc_expires: user.expires
    };

    db().query(sql, ocUser, function (err, result) {
        if (!err) {
            console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
        }
        return cb(err, user);
    });
}

function refreshUser(user, cb) {
    console.log('RT: Refreshing token for user ' + user.data.user_id);

    user.refresh().then(function (updatedUser) {
        console.log('AccessToken: ' + updatedUser.accessToken);
        console.log('RefreshToken: ' + updatedUser.refreshToken);
        console.log('Expires: ' + updatedUser.expires);

        var updatedToken = [
            // new values
            {
                oc_accesstoken: updatedUser.accessToken,
                oc_refreshtoken: updatedUser.refreshToken,
                oc_expires: updatedUser.expires
            },
            // condition
            {
                oc_userid: updatedUser.data.user_id
            }
        ];

        var sql_UpdateToken = 'UPDATE wastecalendar.oc_user SET ? WHERE ?';

        db().query(sql_UpdateToken, updatedToken, function (err, result) {
            if (!err) {
                console.log(result.affectedRows + ' record updated');
            }

            if (cb) {
                cb(err, updatedUser);
            }
        });
    });
}

function insertAndUpdateUser(user, res) {
    insertUser(user, function (error, user) {
        if (error) {
            console.error(error);
            res.statusCode = 500;
            res.end();
            return;
        }
        refreshUser(user, function (error, updatedUser) {
            if (error) {
                console.error(error);
                res.statusCode = 500;
                res.end();
                return;
            }
            return res.send(updatedUser.accessToken);
        });
    });
}

var pub = express.Router();

pub.get('/auth/nextcloud', function (req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    var uri = nextcloudAuth.code.getUri();

    console.log(util.inspect(uri));
    res.redirect(uri);
});

pub.get('/auth/nextcloud/callback', function (req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    nextcloudAuth.code.getToken(req.originalUrl).then(function (user) {
        console.log(user);
/*
        var options = {
            'method': 'GET',
            'url': 'https://cloud.vchrist.at/ocs/v2.php/cloud/user?format=json',
            'headers': {
                'Authorization': 'Bearer ' + user.accessToken
            }
        };

        request(options, function (error, response) {
            console.log('Error: ' + error);
            console.log('Response: ' + response);
// Todo: Check if user exists ... 
        });
*/
        var sql = `SELECT * FROM wastecalendar.oc_user WHERE oc_userid = ${db.escape(user.data.user_id)}`;

        db().query(sql, function (err, result) {
            if (err) {
                console.error(err.stack);
                res.statusCode = 500;
                res.end();
                return;
            }
            console.log(result.length + ' records found ' + util.inspect(result));

            if (result && result.length) {
                sql = `DELETE FROM wastecalendar.oc_user WHERE oc_userid = ${db.escape(user.data.user_id)}`;
                db().query(sql, function (err, result) {
                    if (err) {
                        console.error(err.stack);
                        res.statusCode = 500;
                        res.end();
                        return;
                    }
                    console.log(result.affectedRows + ' records updated ' + util.inspect(result));

                    insertAndUpdateUser(user, res);
                });
            } else {
                insertAndUpdateUser(user, res);
            }
        });
    });
});

module.exports = pub;
