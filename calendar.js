/*jshint esversion: 8 */
/*jslint node: true */

var util = require('util');
var request = require('request');
var ICAL = require('ical.js');
var nextcloudAuth = require(__dirname + '/ncoauth2');


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

function getCalendar(user, cb) {

}

module.exports = {
    getCalendar,
    processCalendar
};
