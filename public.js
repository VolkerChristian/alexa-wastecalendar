#!/usr/bin/node

/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

const express = require('express');
var util = require('util');
var uuid = require('uuid/v1');
var cookieParser = require('cookie-parser');
var {
    nextcloudAuth
} = require(__dirname + '/ncoauth2');
var {
    db,
    queryUser,
    insertUser,
    deleteUser
} = require(__dirname + '/database.js');

var pub = express.Router();
pub.use(cookieParser());

pub.get('/', function (req, res) {
    var uri = nextcloudAuth.getLoginUri();
    res.redirect(uri);
});

var cookieStore = {};

// Todo: Manage expired cookies

nextcloudAuth.setLoginUri('https://ep.vchrist.at/nodejs/wastereminder/auth/nextcloud');

pub.get('/auth/nextcloud', function (req, res) {
    if (db().state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }
/*
    1. Create a cookie and store the stateOpt in the store indext by the cookie.
    2. Set the cookie in the uri for the request
    4. Create a state value for the oauth handshake
    3. Store the state in a state-store indexed by the cooki value
    4. Set the state in the authorization code grant request to the authorization server
    5. Set a timeout (10Min) for the cookie
*/

    var cookie = uuid();

    res.cookie('grant', cookie, {
        domain: 'ep.vchrist.at',
        path: '/nodejs/wastereminder/auth/nextcloud',
        httpOnly: true,
        secure: true
    });

    cookieStore[cookie] = {
        state: uuid(),
        date: Date()
    };

    setTimeout(function (cookie) {
        console.log('Cookie ' + cookie + ' expired.');
        delete cookieStore[cookie];
    }, 600 * 1000, cookie);

    console.log('Response grant-cookie: ' + JSON.stringify(cookie, null, 4));
    console.log('Response state of grant-cookie: ' + JSON.stringify(cookieStore[cookie].state, null, 4));

    var stateOpt = {
        state: cookieStore[cookie].state
    };

    var uri = nextcloudAuth.code.getUri(stateOpt);
    console.log(util.inspect(uri));
    res.redirect(uri);
});

pub.get('/auth/nextcloud/callback', function (req, res) {
    if (db().state === 'disconnected') {
        return res.status(500).send('No Database connection!\n');
    }

    /*
        1. Retrieve the cookie from the request
        2. Look for the stateOpt in the store indext by the cookie
        3. Remove the cookie from the store
    */

    var state = cookieStore[req.cookies.grant] ? cookieStore[req.cookies.grant].state : '';

    console.log('Request cookie: ' + JSON.stringify(req.cookies, null, 4));
    console.log('Request state of grant-cookie: ' + JSON.stringify(state));

    var stateOpt = {
        state: state
    };

    delete cookieStore[req.cookies.grant];

    res.clearCookie('grant', {
        domain: 'ep.vchrist.at',
        path: '/nodejs/wastereminder/auth/nextcloud',
        httpOnly: true,
        secure: true,
        expires: new Date(1)
    });

    nextcloudAuth.code.getToken(req.originalUrl, stateOpt).then(function (user) {
        queryUser(user.data.user_id, function (err, result) {
            if (err) {
                console.error(err.stack);
                res.statusCode = 500;
                return res.end();
            } else if (result && result.length) {
                deleteUser(user.data.user_id, function (err) {
                    if (err) {
                        console.error(err.stack);
                        res.statusCode = 500;
                        return res.end();
                    }
                    insertUser(user, function(err) {
                        if (err) {
                            console.error(err);
                            return res.status(500).send('Error Updating User in db');
                        }
                        return res.send(user.accessToken);
                    });
                });
            } else {
                insertUser(user, function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('Error Updating User in db');
                    }
                    return res.send(user.accessToken);
                });
            }
        });
    }).catch(function (err) {
        console.error('Auth error: Not authorized');
        res.status(401).send('Auth error: Not authorized');
    });
});

module.exports = pub;