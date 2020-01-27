/*jshint esversion: 6 */
/*jslint node: true */
'use strict';

//const fs = require('fs');

declare const System: any;

import fs from 'fs';

import { ExpressAdapter } from 'ask-sdk-express-adapter';
import { CustomSkill } from 'ask-sdk-core/dist/skill/CustomSkill';

/*
const {
    ExpressAdapter
} = require('ask-sdk-express-adapter');
*/

var skill: Promise<CustomSkill>;
if (fs.existsSync(__dirname + '/lambda.ts')) {

    skill = System.import("./lambda.ts");
}

var init: Promise<any>;
if (fs.existsSync(__dirname + '/local.ts')) {
    init = System.import('./local.ts');
}

var router: any;
if (fs.existsSync(__dirname + '/public.js')) {
    router = require(__dirname + '/public');
}

var newSkill: CustomSkill;
var newInit: any;

async function load() {
    [newSkill, newInit] = await Promise.all([skill, init]);
    var handlers = new ExpressAdapter(newSkill, true, true).getRequestHandlers();
    var skillPath = '/handler';
    var init = newInit;
    var endpointPath = '/wastereminer';
    var name = 'Waste Reminder';
    return {
        handlers: handlers,
        skillPath: '/handler',
        init: init,
        router: router,
        endpointPath: endpointPath,
        name: name
    }
}

export = new Promise(function(resolve, reject) {
    resolve(load());
})

/*
module.exports = {
    handlers: new ExpressAdapter(skill, true, true).getRequestHandlers(),
    skillPath: '/handler',
    init: init,
    router: router,
    endpointPath: '/wastereminder',
    name: 'Waste Reminder'
};
*/
