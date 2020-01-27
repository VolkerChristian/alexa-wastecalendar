/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

import ClientOAuth2 from 'client-oauth2';
//ClientOAuth2.

//var ClientOAuth2 = require('client-oauth2');

import {updateUserToken} from './database';

//var {updateUserToken} = require(__dirname + ('/database'));

interface MyOptions extends ClientOAuth2.Options {
    loginUri?: string
}

interface MyClientOAuth2I extends ClientOAuth2 {
    getLoginUri(): string;
    setLoginUri(uri: string  | undefined): void
}

class MyClientOAuth2 extends ClientOAuth2 implements MyClientOAuth2I {
    loginUri: any;
    constructor(data: MyOptions) {
        super(data);
    }

    getLoginUri() {
        return this.loginUri;
    }

    setLoginUri(uri: string | undefined) {
        this.loginUri = uri;
    }
}

var nextcloudAuth = new MyClientOAuth2({
    clientId: '8phIFMUJdLFneoFJLEaRKI66JqEbuelJ274KI4Gy5pcFMszJMXJtagkt2AjTxTkF',
    clientSecret: 'OPrt8WfF7tKHV7ufdqhqfO8SgOIYAofqQPT6jqK9S2tqsDghL4G0tvgMbRcFmVSM',
    accessTokenUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/api/v1/token',
    authorizationUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/authorize',
    redirectUri: 'https://ep.vchrist.at/wastereminder/auth/nextcloud/callback',
    scopes: []
});

function refreshUser(user: ClientOAuth2.Token, cb) {
    console.log('RT: Refreshing token for user ' + user.data.user_id);

    user.refresh().then(function (user) {
        console.log('AccessToken: ' + user.accessToken);
        console.log('RefreshToken: ' + user.refreshToken);
        console.log('Expires: ' + user.expiresIn);
        console.log('Expired: ' + user.expired);

        updateUserToken(user, function (err) {
            if (cb) {
                cb(err, user);
            }
        });
    }).catch(function(reason) {
        if (cb) {
            cb(reason, null);
        }
    });
}


function getNCUser(oc_user, cb) {
    var tokenData: ClientOAuth2.Data = {
        accessToken: oc_user.oc_accesstoken,
        refreshToken: oc_user.oc_refreshtoken,
        tokenType: 'bearer'
    };

    var user = nextcloudAuth.createToken(tokenData);
    user.expiresIn(oc_user.ac_expires);

    if (user.expired()) {
        refreshUser(user, function (err, user) {
            cb(err, user);
        });
    } else {
        cb(null, user);
    }
}

module.exports = {
    nextcloudAuth,
    refreshUser,
    getNCUser
};
