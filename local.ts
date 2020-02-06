#!/usr/bin/node

/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

// const express = require('express');
import express from 'express';

var request = require('request');

var {
    getNCUser
} = require(__dirname + '/ncoauth2');

var {
    db,
    queryUser,
    promiseQueryAmzUser,
    promiseAmzEndpointTokenUpdate,
    promiseAmzEndpointTokenInsert
} = require(__dirname + '/database.js');

var {
    processCalendar
} = require('./calendar.js');

class UnixDate extends Date 
{/*
    toUnixTime(): number {
        return this.getTime() / 1000 | 0;
    }*/

    static unixTime() {
         return new UnixDate().getTime() / 1000 | 0;
    }
}

function refreshAmzProactiveEndpointToken(cb: (err: any, response: string | null, body: string | null) => any) {
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

    request(options, function (error: any, response: string, body: string) {
        if (error) {
            console.error(error);
            return cb(error, null, null);
        } else {
            return cb(null, response, body);
        }
    });
}

interface AmzUser {
    'endpoint': string;
    'userid': any;
    'token': string;
    'expired': boolean;
}

function getAmzProactiveEndpointAccessToken(amz_skillid: string, oc_userid: string, cb: (err: any, user: AmzUser | null) => any) {
    var promiseAmzUser = promiseQueryAmzUser(amz_skillid, oc_userid);
    promiseAmzUser.then(function (user: AmzUser) {
        if (user) {
            if (user.token) {
                // Found token
                console.log('User and accesstoken found');
                if (!user.expired) {
                    // Token valid
                    console.log('Token valid');
                    cb(null, user);
                } else {
                    // update token
                    console.log('Token expired');
                    promiseAmzEndpointTokenUpdate(amz_skillid).then(function (token: string) {
                        console.log('Token updated');
                        Object.assign(user, token);
                        cb(null, user);
                    }).catch(function (reason: string) {
                        cb(reason, null);
                    });
                }
            } else {
                // insert token
                console.log('No accesstoken for user found');
                promiseAmzEndpointTokenInsert(amz_skillid).then(function (token: string) {
                    console.log('Token inserted');
                    Object.assign(user, token);
                    cb(null, user);
                }).catch(function (reason: string) {
                    cb(reason, null);
                });
            }
        } else {
            console.log('No amazon user found');
            cb(null, null);
        }
    }).catch(function (reason: string) {
        console.error(reason);
        cb(reason, null);
    });
}

function sendProactiveEvent(user: AmzUser, cb: { (err: any, response: string): any; (arg0: any, arg1: string): void; }) {
    console.log('Sending Proactive Event for user ' + JSON.stringify(user, null, 4));

    // Sets expiryTime 23 hours ahead of the current date and time
    let expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + 23);
    let expiryTimeS = expiryTime.toISOString();

    let timestamp = new Date();

    var options = {
        method: 'POST',
        url: user.endpoint + '/v1/proactiveEvents/stages/development',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + user.token
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
                    user: user.userid
                }
            }
        })
    };
    request(options, function (err, response) {
        cb(err, response);
    });
}

function init(skill: any) {
    var manager = express();
    var managerListener = manager.listen(8081, function () {
        var router = express.Router();
        manager.use(skill.path(), router);

        router.get('/test', function (req, res) {
            if (db().state === 'disconnected') {
                return res.status(502).send('No Database connection!\n');
            }
            console.log('PC: Looking for registered user');

            queryUser(function (err, result) {
                if (err) {
                    console.error(err.stack);
                    res.statusCode = 500;
                    res.end();
                    return;
                }

                if (result && result.length) {
                    result.forEach(function (oc_user) {
                        console.log('PC: Processing user ' + oc_user.oc_userid);

                        getNCUser(oc_user, function (err, user) {
                            if (err) {
                                console.error(err);
                                return res.status(500).send(err);
                            }
                            processCalendar(user, oc_user, function (err, body) {
                                if (err) {
                                    console.error(err);
                                    return res.status(500).send(err);
                                }
                                return res.send(body);
                            });

                        });
                    });
                } else {
                    res.end();
                    return;
                }
            });
        });

        router.get('/amz', function (req, res) {
            if (db().state === 'disconnected') {
                return res.status(502).send('No Database connection!\n');
            }

            const skillid = 'amzn1.ask.skill.5119403b-f6c6-45f8-bd7e-87787e6f5da2';

            getAmzProactiveEndpointAccessToken(skillid, 'voc', function (err, user) {
                if (!err) {
                    if (user.permission) {
                        sendProactiveEvent(user, function (err, response) {
                            if (err) {
                                return res.status(502).send(err);
                            }
                            return res.send('SkillId: ' + skillid + ': ' + '\n\tUserId: ' + user.userid + '\n\tPermission: ' + user.permission + '\n\tEndpoint: ' + user.endpoint + '\n\tToken: ' + user.token + '\n\tExpires: ' + user.expires + '\n\tExpired: ' + user.expired + '\n');
                        });
                    } else {
                        console.log('Not subscribed for sending Proactive Event for user ' + JSON.stringify(user, null, 4));
                        return res.status(423).send('Not subscribed:\nSkillId: ' + skillid + ': ' + '\n\tUserId: ' + user.userid + '\n\tPermission: ' + user.permission + '\n\tEndpoint: ' + user.endpoint + '\n\tToken: ' + user.token + '\n\tExpires: ' + user.expires + '\n\tExpired: ' + user.expired + '\n');
                    }
                } else {
                    console.error(err);
                    return res.status(500).send(err);
                }
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