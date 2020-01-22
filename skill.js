/*jshint esversion: 6 */
/*jslint node: true */
'use strict';

const fs = require('fs');

var skill;
if (fs.existsSync(__dirname + '/lambda.js')) {
    skill = require(__dirname + '/lambda').handler;
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
    skill: skill,
    skillPath: '/handler',
    init: init,
    router: router,
    endpointPath: '/wastereminder',
    name: 'Waste Reminder'
};
