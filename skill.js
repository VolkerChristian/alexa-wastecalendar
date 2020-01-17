/*jshint esversion: 6 */
/*jslint node: true */
'use strict';

const fs = require('fs');

var handler;
if (fs.existsSync(__dirname + '/lambda.js')) {
    handler = require(__dirname + '/lambda');
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
    handler: handler,
    init: init,
    router: router,
    endpointPath: '/wastereminder',
    name: 'Waste Reminder'
};
