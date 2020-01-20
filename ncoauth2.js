/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

var ClientOAuth2 = require('client-oauth2');
var {updateUserToken} = require(__dirname + ('/database'));

class MyClientOAuth2 extends ClientOAuth2 {
    constructor(data) {
        super(data);
    }

    getLoginUri() {
        return this.loginUri;
    }

    setLoginUri(uri) {
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

function refreshUser(user, cb) {
    console.log('RT: Refreshing token for user ' + user.data.user_id);

    user.refresh().then(function (user) {
        console.log('AccessToken: ' + user.accessToken);
        console.log('RefreshToken: ' + user.refreshToken);
        console.log('Expires: ' + user.expires);

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
    var tokenData = {
        access_token: oc_user.oc_accesstoken,
        refresh_token: oc_user.oc_refreshtoken,
        token_type: 'bearer',
        user_id: oc_user.oc_userid,
        expires_in: oc_user.oc_expires.toUnixTime() - Date.unixTime() - 600
    };

    var user = nextcloudAuth.createToken(tokenData);

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
    getNCUser
};
