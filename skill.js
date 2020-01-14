/*jshint esversion: 6 */

// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.
const Alexa = require('ask-sdk-core');
var request = require('request');
var mysql = require('mysql');
var util = require('util');

var db;

function handleDisconnect() {
    db = mysql.createConnection({
//        host: 'proliant.home.vchrist.at',
        host: '192.168.1.3',
        user: 'wastecalendar',
        password: '!!!SoMaSi01!!!'
    });

    db.connect(function onConnect(err) {
        if (err) {
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 1000);
        } else {
            console.log('MySQL Connected!');
        }
    });

    db.origQuery = db.query;

    db.query = function (sql, values, cb) {
        console.log('Query start: ' + sql);
        if (!cb) {
            cb = values;
            values = null;
        }
        db.origQuery(sql, values, function (err, result) {
            console.log('Query end');
            if (err) {
                console.error(err.stack);
                setTimeout(handleDisconnect, 1000);
            }
            cb(err, result);
        });
    };

    db.on('error', function(error) {
        console.log('On Error: ' + error);
        if (!error.fatal) return;
        if (error.code !== 'PROTOCOL_CONNECTION_LOST' && error.code !== 'PROTOCOL_PACKETS_OUT_OF_ORDER' && error.code !== 'ECONNREFUSED') throw error;

        console.log('> Re-connecting lost MySQL connection: ' + error.stack);

        setTimeout(handleDisconnect, 1000);
    });
}

handleDisconnect();

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'Welcome, you can say Hello or Help. Which would you like to try?';

        console.log('~~~~ LaunchRequest handled: ' + JSON.stringify(handlerInput, null, '    '));
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const HelloWorldIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === 'HelloWorldIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Hello World!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse();
    }
};
const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = 'You just triggered ' + intentName;

        return handlerInput.responseBuilder
            .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log('~~~~Error handled: ' + error.stack);
        const speakOutput = `Sorry, I had trouble doing what you asked.Please
        try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const ProactiveEventHandler = {
    canHandle(handlerInput) {
        //        console.log(handlerInput);
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.ProactiveSubscriptionChanged';
    },
    handle(handlerInput) {
        console.log('ALL AlexaSkillEvent.ProactiveSubscriptionChanged ' + JSON.stringify(handlerInput, null, 4));
        console.log('AWS User ' + handlerInput.requestEnvelope.context.System.user.userId);
        console.log('API Endpoint ' + handlerInput.requestEnvelope.context.System.apiEndpoint);
        console.log('Permissions' + (typeof handlerInput.requestEnvelope.request.body !== 'undefined') ? 'JA' : 'NEIN');
        
        sql = `UPDATE wastecalendar.amz_user SET amz_permissions = ${(typeof handlerInput.requestEnvelope.request.body !== 'undefined') ? 1 : 0} WHERE amz_userid = ${db.escape(handlerInput.requestEnvelope.context.System.user.userId)}`;
        console.log('SQL: ' + sql);
        db.query(sql, function(err, result) {
            if (err) {
                console.error(err.stack);
            } else {
                console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
            }
        });
    }
};

const AccountLinkedEventHandler = {
    canHandle(handlerInput) {
        //        console.log(handlerInput);
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.SkillAccountLinked';
    },
    handle(handlerInput) {
        console.log('ALL AlexaSkillEvent.SkillAccountLinked ' + JSON.stringify(handlerInput, null, 4));
        console.log('AWS UserID ' + handlerInput.requestEnvelope.context.System.user.userId);
        console.log('OC AccessToken ' + handlerInput.requestEnvelope.context.System.user.accessToken);
        console.log('API Endpoint ' + handlerInput.requestEnvelope.context.System.apiEndpoint);
        console.log('API AccessToken ' + handlerInput.requestEnvelope.context.System.apiAccessToken);
        var options = {
            'method': 'GET',
            'url': 'https://cloud.vchrist.at/ocs/v2.php/cloud/user?format=json',
            'headers': {
                'Authorization': 'Bearer ' + handlerInput.requestEnvelope.context.System.user.accessToken
            }
        };
        request(options, function(error, response) {
            if (error) throw new Error(error);
            oc_data = JSON.parse(response.body);
            console.log('OC Response: ' + JSON.stringify(oc_data, null, 4));
                    
            sql = `UPDATE wastecalendar.amz_user SET oc_userid = ${db.escape(oc_data.ocs.data.id)}, amz_accountlinked = 1 WHERE amz_userid = ${db.escape(handlerInput.requestEnvelope.context.System.user.userId)}`;
            console.log('SQL: ' + sql);
            db.query(sql, function(err, result) {
                if (err) {
                    console.error(err.stack);
                } else {
                    console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
                }
            });
        });
    }
};

const SkillEnabledEventHandler = {
    canHandle(handlerInput) {
        //        console.log(handlerInput);
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.SkillEnabled';
    },
    handle(handlerInput) {
        console.log('ALL AlexaSkillEvent.SkillEnabled ' + JSON.stringify(handlerInput, null, 4));
        console.log('AWS UserID ' + handlerInput.requestEnvelope.context.System.user.userId);
        console.log('API Endpoint ' + handlerInput.requestEnvelope.context.System.apiEndpoint);
        
        sql = `INSERT INTO wastecalendar.amz_user (amz_skillid, amz_userid, amz_apiendpoint, amz_apiaccesstoken) VALUES (
            ${db.escape(handlerInput.requestEnvelope.context.System.application.applicationId)},
            ${db.escape(handlerInput.requestEnvelope.context.System.user.userId)},
            ${db.escape(handlerInput.requestEnvelope.context.System.apiEndpoint)},
            ${db.escape(handlerInput.requestEnvelope.context.System.apiAccessToken)}
        )`;
        console.log('SQL: ' + sql);
        db.query(sql, function(err, result) {
            if (err) {
                console.error(err.stack);
            } else {
                console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
            }
        });
    }
};

const SkillDisabledEventHandler = {
    canHandle(handlerInput) {
        //        console.log(handlerInput);
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.SkillDisabled';
    },
    handle(handlerInput) {
        console.log('ALL AlexaSkillEvent.SkillDisabled ' + JSON.stringify(handlerInput, null, 4));
        console.log('AWS UserID ' + handlerInput.requestEnvelope.context.System.user.userId);
        console.log('API Endpoint ' + handlerInput.requestEnvelope.context.System.apiEndpoint);
        console.log('Persistence State ' + handlerInput.requestEnvelope.request.body.userInformationPersistenceStatus);
        
        sql = `DELETE FROM wastecalendar.amz_user WHERE amz_userid = ${
                db.escape(handlerInput.requestEnvelope.context.System.user.userId)
            } AND amz_skillid = ${
                db.escape(handlerInput.requestEnvelope.context.System.application.applicationId)
            }`;
        console.log('SQL: ' + sql);
        db.query(sql, function(err, result) {
            if (err) {
                console.error(err.stack);
            } else {
                console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
            }
        });
    }
};

//console.log('Test: ' + (typeof hallo == 'undefined') ? 'ja' : 'nein');
// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
    LaunchRequestHandler,
    HelloWorldIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    ProactiveEventHandler,
    AccountLinkedEventHandler,
    SessionEndedRequestHandler,
    SkillEnabledEventHandler,
    SkillDisabledEventHandler,
    IntentReflectorHandler // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
)
    .addErrorHandlers(
    ErrorHandler)
    .lambda();