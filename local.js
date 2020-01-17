#!/usr/bin/node

/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

const express = require('express');
var ClientOAuth2 = require('client-oauth2');
var util = require('util');
var request = require('request');
var ICAL = require('ical.js');
var db = require('database.js');

var nextcloudAuth = new ClientOAuth2({
    clientId: '8phIFMUJdLFneoFJLEaRKI66JqEbuelJ274KI4Gy5pcFMszJMXJtagkt2AjTxTkF',
    clientSecret: 'OPrt8WfF7tKHV7ufdqhqfO8SgOIYAofqQPT6jqK9S2tqsDghL4G0tvgMbRcFmVSM',
    accessTokenUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/api/v1/token',
    authorizationUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/authorize',
    redirectUri: 'https://ep.vchrist.at/wastereminder/auth/nextcloud/callback',
    scopes: []
});

Date.prototype.toUnixTime = function () {
    return this.getTime() / 1000 | 0;
};

Date.unixTime = function () {
    return new Date().toUnixTime();
};

function processCalendar(user, cb) {
    console.log('PC: Calendar');
    var rec = user.sign({
        url: 'https://cloud.vchrist.at/remote.php/dav/calendars/' + user.data.user_id + '/mllabfuhr/?export' + '&expand=1' + '&start=' + Date.unixTime() + '&end=' + Date.unixTime() + 3600 * 24,
        headers: {
            Accept: 'application/calendar+json'
        }
    });

    request(rec, function (error, response, body) {
        var str = '';
        if (!error) {
            var iCalData = JSON.parse(body);
            var comp = new ICAL.Component(iCalData);
            var vevent = comp.getFirstSubcomponent('vevent');
            var event = new ICAL.Event(vevent);

            if (event.startDate) {
                str = 'Event Summary: ' + event.summary + '\nLocale Start: ' + event.startDate.toJSDate() + '\nLocale End: ' + event.endDate.toJSDate();
            } else {
                str = 'No Event';
            }

            console.log(str);
        }
        cb(error, str + '\n');
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

        db.query(sql_UpdateToken, updatedToken, function (err, result) {
            if (!err) {
                console.log(result.affectedRows + ' record updated');
            }

            if (cb) {
                cb(err, updatedUser);
            }
        });
    });
}

function refreshAmzProactiveEndpointToken(cb) {
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
        }
        return cb(error, response, body);
    });
}

function getAmzProactiveEndpointAccessToken(amz_skillid, oc_userid, cb) {
    var sql = 'select u.amz_userid, u.amz_permissions, u.amz_apiendpoint, u.oc_userid, e.amzep_accesstoken, e.amzep_expires from wastecalendar.amz_user u left outer join wastecalendar.amz_endpoint e on u.amz_skillid = e.amzep_skillid WHERE u.oc_userid = ? AND u.amz_skillid = ?';

    console.log('AMZ: Looking for access-token for skill \'' + amz_skillid + '\' and user \'' + oc_userid + '\'');

    db.query(sql, [oc_userid, amz_skillid], function (err, result) {
        if (err) {
            return cb(err, null);
        }

        if (!(result && result.length)) {
            console.log('AMZ  No user found for skill \'' + amz_skillid + '\' and user \' ... stop processing');
            return cb(err, null);
        } else if (!result[0].amzep_accesstoken) {
            console.log('AMZ: No access token found for skill \'' + amz_skillid + '\' and user \'' + oc_userid + '\' ... retrieving');
            refreshAmzProactiveEndpointToken(function (error, response, body) {
                if (error) {
                    return cb(error, null);
                }
                body = JSON.parse(response.body);
                console.log('AMZ: Got new access token for skill \'' + amz_skillid + '\': ' + body.expires_in + ' - ' + body.access_token);

                var amzEndpointToken = {
                    amzep_skillid: amz_skillid,
                    amzep_accesstoken: body.access_token,
                    amzep_expires: new Date((Date.unixTime() + body.expires_in - 600) * 1000)
                };

                var sql = 'INSERT INTO wastecalendar.amz_endpoint SET ?';

                db.query(sql, amzEndpointToken, function (err, result) {
                    if (!err) {
                        console.log(result.affectedRows + ' records inserted ');
                    }
                    return cb(err, {
                        userid: result[0].amz_userid,
                        permission: result[0].amz_permissions,
                        endpoint: result[0].amz_apiendpoing,
                        expires: body.expires_in,
                        token: body.access_token
                    });
                });
            });
        } else {
            console.log('AMZ: Access token found for skill \'' + amz_skillid + '\': ' + result[0].amzep_expires + ' - ' + result[0].amzep_accesstoken);
            if (result[0].amzep_expires.toUnixTime() - Date.unixTime() < 600) {
                // Token expired
                console.log('AMZ: Token expired. Refreshing ...');

                refreshAmzProactiveEndpointToken(function (error, response, body) {
                    if (error) {
                        return cb(error, null);
                    }
                    body = JSON.parse(response.body);
                    var amzUpdatedToken = [
                        // new values
                        {
                            amzep_accesstoken: body.access_token,
                            amzep_expires: new Date((Date.unixTime() + body.expires_in) * 1000)
                        },
                        // condition
                        {
                            amzep_skillid: amz_skillid
                        }
                    ];

                    console.log('AMZ: Got updated access token for skill \'' + amz_skillid + '\': ' + amzUpdatedToken[0].amzep_expires + ' - ' + amzUpdatedToken[0].amzep_accesstoken);

                    var sql = 'UPDATE wastecalendar.amz_endpoint SET ? WHERE ?';

                    db.query(sql, amzUpdatedToken, function (err, updateResult) {
                        if (!err) {
                            console.log(updateResult.affectedRows + ' records inserted ');
                        }
                        return cb(err, {
                            userid: result[0].amz_userid,
                            permission: result[0].amz_permissions,
                            endpoint: result[0].amz_apiendpoint,
                            expires: amzUpdatedToken[0].amzep_expires,
                            token: amzUpdatedToken[0].amzep_accesstoken
                        });
                    });
                });
            } else {
                console.log('AMZ: Token valid');
                // Token not expired
                return cb(err, {
                    userid: result[0].amz_userid,
                    permission: result[0].amz_permissions,
                    endpoint: result[0].amz_apiendpoint,
                    expires: result[0].amzep_expires,
                    token: result[0].amzep_accesstoken
                });
            }
        }
    });
}

function sendProactiveEvent(apiEndpoint, apiAccessToken, amzUserId) {
    let timestamp = new Date();

    console.log('Send proactive event to user ' + amzUserId);

    // Sets expiryTime 23 hours ahead of the current date and time
    let expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + 23);
    expiryTime = expiryTime.toISOString();

    var request = require('request');
    var options = {
        method: 'POST',
        url: apiEndpoint + '/v1/proactiveEvents/stages/development',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiAccessToken
        },
        body: JSON.stringify({
            timestamp: timestamp.toISOString(),
            referenceId: 'wastecalendar-event-' + timestamp.toUnixTime(),
            expiryTime: expiryTime,
            event: {
                name: 'AMAZON.TrashCollectionAlert.Activated',
                payload: {
                    alert: {
                        garbageTypes: ['LANDFILL', 'RECYCLABLE_PLASTICS', 'WASTE_PAPER'],
                        collectionDayOfWeek: 'TUESDAY'
                    }
                }
            },
            relevantAudience: {
                type: 'Unicast',
                payload: {
                    user: amzUserId
                }
            }
        })

    };
    request(options, function (error, response) {
        if (error) throw new Error(error);
        console.log(response.body);
    });
}

function init(skill) {
    var manager = express();
    var managerListener = manager.listen(8081, function () {
        var router = express.Router();
        manager.use(skill.path(), router);

        router.get('/test', function (req, res) {
            //    sendProactiveEvent();
            if (db.state === 'disconnected') {
                return res.status(500).send('No Database connection!\n');
            }

            var sql = 'SELECT * FROM wastecalendar.oc_user';

            console.log('PC: Looking for registered user');
            db.query(sql, function (err, result) {
                if (err) {
                    console.error(err.stack);
                    res.statusCode = 500;
                    res.end();
                    return;
                }

                if (result && result.length) {
                    result.forEach(function (oc_user) {
                        console.log('PC: Processing user ' + oc_user.oc_userid);

                        var tokenData = {
                            access_token: oc_user.oc_accesstoken,
                            refresh_token: oc_user.oc_refreshtoken,
                            token_type: 'bearer',
                            user_id: oc_user.oc_userid,
                            expires_in: oc_user.oc_expires.toUnixTime() - Date.unixTime() - 600
                        };

                        var user = nextcloudAuth.createToken(tokenData);

                        if (user.expired()) {
                            refreshUser(user, function (error, updatedUser) {
                                if (error) {
                                    console.error(error);
                                    res.statusCode = 500;
                                    res.end();
                                    return;
                                }
                                processCalendar(updatedUser, function (error, body) {
                                    if (error) {
                                        console.error(err.stack);
                                        res.statusCode = 500;
                                        res.end();
                                        return;
                                    }
                                    return res.send(body);
                                });
                            });
                        } else {
                            processCalendar(user, function (error, body) {
                                if (error) {
                                    console.error(err.stack);
                                    res.statusCode = 500;
                                    res.end();
                                    return;
                                }
                                return res.send(body);
                            });
                        }
                    });
                } else {
                    res.end();
                    return;
                }
            });
        });

        router.get('/amz', function (req, res) {
            if (db.state === 'disconnected') {
                return res.status(500).send('No Database connection!\n');
            }

            const skillid = 'amzn1.ask.skill.5119403b-f6c6-45f8-bd7e-87787e6f5da2';

            getAmzProactiveEndpointAccessToken(skillid, 'voc', function (error, accessToken) {
                if (error) {
                    console.error(error);
                    res.statusCode = 500;
                    res.end();
                    return;
                }
                if (accessToken.permission) {
                    sendProactiveEvent(accessToken.endpoint, accessToken.token, accessToken.userid);
                }
                return res.send('SkillId: ' + skillid + ': ' + '\n\tUserId: ' + accessToken.userid + '\n\tEndpoint: ' + accessToken.endpoint + '\n\tToken: ' + accessToken.token + '\n\tExpires: ' + accessToken.expires + '\n');
            });
        });

        router.stack.forEach(function (r) {
            if (r.route && r.route.path) {
                console.log('[' + managerListener.address().address + ']:' + managerListener.address().port + skill.path() + r.route.path);
            }
        });
    });
}

module.exports = init;

/*
exports.init = init;
exports.lambda = '';
exports.router = '';
*/

/*
let getQueueLength = function() {
    return Math.round(12 * Math.random());
};

// We would like to retrieve the queue length at regular intervals
// this way, we can decide when to make a quick dash over
// at the optimal time

setInterval(function() {
    let queueLength = getQueueLength();

    console.log(`The queue at the McDonald's drive-through is now ${queueLength} cars long.`);

    if (queueLength === 0) {
        console.log('Quick, grab your coat!');
    }

    if (queueLength > 8) {
        return console.log('This is beginning to look impossible!');
    }
}, 3000);
*/