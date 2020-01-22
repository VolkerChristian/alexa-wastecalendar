/*jshint esversion: 6 */
/*jslint node: true */
'use strict';

const fs = require('fs');
const {
    ExpressAdapter
} = require('ask-sdk-express-adapter');

var skill;
if (fs.existsSync(__dirname + '/lambda.js')) {
    skill = require(__dirname + '/lambda').skill;
}

var init;
if (fs.existsSync(__dirname + '/local.js')) {
    init = require(__dirname + '/local');
}

var router;
if (fs.existsSync(__dirname + '/public.js')) {
    router = require(__dirname + '/public');
}

module.exports = {
    handlers: new ExpressAdapter(skill, true, true).getRequestHandlers(),
    skillPath: '/handler',
    init: init,
    router: router,
    endpointPath: '/wastereminder',
    name: 'Waste Reminder'
};
