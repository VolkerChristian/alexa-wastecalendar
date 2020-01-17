/*jshint esversion: 6 */
/*jslint node: true */

'use strict';


var ClientOAuth2 = require('client-oauth2');

var nextcloudAuth = new ClientOAuth2({
    clientId: '8phIFMUJdLFneoFJLEaRKI66JqEbuelJ274KI4Gy5pcFMszJMXJtagkt2AjTxTkF',
    clientSecret: 'OPrt8WfF7tKHV7ufdqhqfO8SgOIYAofqQPT6jqK9S2tqsDghL4G0tvgMbRcFmVSM',
    accessTokenUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/api/v1/token',
    authorizationUri: 'https://cloud.vchrist.at/index.php/apps/oauth2/authorize',
    redirectUri: 'https://ep.vchrist.at/wastereminder/auth/nextcloud/callback',
    scopes: []
});


module.exports = nextcloudAuth;
