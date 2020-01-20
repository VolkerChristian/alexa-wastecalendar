#!/usr/bin/node

/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

const express = require('express');
var util = require('util');
//var request = require('request');
//var mysql = require('mysql');
var uuid = require('uuid/v1');
var cookieParser = require('cookie-parser');
var {
    nextcloudAuth
} = require(__dirname + '/ncoauth2');
var {
    db
} = require(__dirname + '/database.js');


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
pub.use(cookieParser());

pub.get('/', function (req, res) {
    var uri = nextcloudAuth.getLoginUri();
//    var uri = 'http://localhost:8080/wastereminder/return';
    res.redirect(uri);
});
/*
pub.get('/return', function(req, res) {
    console.log('Cookie: ' + JSON.stringify(req.cookies, null, 4));
    res.end();
});
*/
var auth = {};

nextcloudAuth.setLoginUri('https://ep.vchrist.at/nodejs/wastereminder/auth/nextcloud');

pub.get('/auth/nextcloud', function (req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    var cookie = uuid();
    var state = uuid();

    console.log()

    res.cookie('grant', cookie, {
        domain: 'ep.vchrist.at',
        path: '/nodejs/wastereminder/auth/nextcloud'
    });
    auth[cookie] = state;

    console.log('Response grant-cookie: ' + JSON.stringify(cookie, null, 4));
    console.log('Response state of grant-cookie: ' + auth[req.cookies.grant]);

    var stateOpt = {
        state: state
    };

    /*
        1. Create a cookie and store the stateOpt in the store indext by the cookie.
        2. Set the cookie in the uri for the request
    */
    var uri = nextcloudAuth.code.getUri(stateOpt);
    console.log(util.inspect(uri));
    res.redirect(uri);
});

pub.get('/auth/nextcloud/callback', function (req, res) {
    if (db.state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    /*
        1. Retrieve the cookie from the request
        2. Look for the stateOpt in the store indext by the cookie
        3. Remove the cookie from the store
    */
    console.log('Request cookie: ' + JSON.stringify(req.cookies, null, 4));
    console.log('Request state of grant-cookie: ' + auth[req.cookies.grant]);

    var stateOpt = {
        state: auth[req.cookies.grant] + 'fff'
    };

    delete auth[req.cookies.grant];

    nextcloudAuth.code.getToken(req.originalUrl, stateOpt).then(function (user) {
        //console.log(user);
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
        var sql = `SELECT * FROM wastecalendar.oc_user WHERE oc_userid = ${db().escape(user.data.user_id)}`;

        db().query(sql, function (err, result) {
            if (err) {
                console.error(err.stack);
                res.statusCode = 500;
                return res.end();
            }
            console.log(result.length + ' records found ' + util.inspect(result));

            if (result && result.length) {
                sql = `DELETE FROM wastecalendar.oc_user WHERE oc_userid = ${db().escape(user.data.user_id)}`;
                db().query(sql, function (err, result) {
                    if (err) {
                        console.error(err.stack);
                        res.statusCode = 500;
                        return res.end();
                    }
                    console.log(result.affectedRows + ' records updated ' + util.inspect(result));

                    insertAndUpdateUser(user, res);
                });
            } else {
                insertAndUpdateUser(user, res);
            }
        });
    }).catch(function(err) {
        console.error('Auth error: Not authorized');
        res.status(401).send('Auth error: Not authorized');
    });
});

module.exports = pub;