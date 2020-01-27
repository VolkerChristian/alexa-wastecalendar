/*jshint esversion: 6 */
/*jslint node: true */

'use strict';

import {
    getRequestType,
    getIntentName,
    getUserId,
    ErrorHandler,
    HandlerInput,
    RequestHandler,
    SkillBuilders,
    getAccountLinkingAccessToken,
    getApiAccessToken,
    getDeviceId,
    getDialogState,
    getSlot,
    getSlotValue,
    getSupportedInterfaces,
    getLocale,
    getViewportDpiGroup,
    getViewportOrientation,
    getViewportProfile,
    getViewportSizeGroup,
    DefaultApiClient
} from 'ask-sdk-core';
import {
    events,
    services
} from 'ask-sdk-model';

import * as request from 'request';
import * as util from 'util';
const { db } = require('./database.js');

const LaunchRequestHandler: RequestHandler = {
    canHandle(handlerInput) {
        return getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
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

const HelloWorldIntentHandler: RequestHandler = {
    canHandle(handlerInput) {
        return getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            getIntentName(handlerInput.requestEnvelope) === 'HelloWorldIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Hello World!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

const HelpIntentHandler: RequestHandler = {
    canHandle(handlerInput) {
        return getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler: RequestHandler = {
    canHandle(handlerInput) {
        return getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            (getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
                getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler: RequestHandler = {
    canHandle(handlerInput) {
        return getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
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
const IntentReflectorHandler: RequestHandler = {
    canHandle(handlerInput) {
        return getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = getIntentName(handlerInput.requestEnvelope);
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
const ErrorHandler: ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log('~~~~Error handled: ' + error.stack);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const ProactiveEventHandler: RequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.ProactiveSubscriptionChanged';
    },
    handle(handlerInput: HandlerInput) {
        handlerInput.serviceClientFactory?.getEndpointEnumerationServiceClient
        var subscriptions = (handlerInput.requestEnvelope.request as events.skillevents.ProactiveSubscriptionChangedRequest).body.subscriptions;

        var isSubscribed = subscriptions?.filter(value => value.eventName == 'AMAZON.TrashCollectionAlert.Activated');

        console.log('ALL AlexaSkillEvent.ProactiveSubscriptionChanged ' + JSON.stringify(handlerInput, null, 4));
        console.log('AWS User ' + getUserId(handlerInput.requestEnvelope));
        console.log('API Endpoint ' + handlerInput.requestEnvelope.context.System.apiEndpoint);
        console.log('Permissions' + (isSubscribed ? 'JA' : 'NEIN'));

        var sql = `UPDATE wastecalendar.amz_user SET amz_permissions = ${isSubscribed ? 1 : 0} WHERE amz_userid = ${db().escape(handlerInput.requestEnvelope.context.System.user.userId)}`;
        console.log('SQL: ' + sql);
        db().query(sql, function (err: any, result: any) {
            if (err) {
                console.error(err.stack);
            } else {
                console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
            }
        });
        return handlerInput.responseBuilder.getResponse();
    }
};

const AccountLinkedEventHandler: RequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.SkillAccountLinked';
    },
    handle(handlerInput) {
        console.log('ALL AlexaSkillEvent.SkillAccountLinked ' + JSON.stringify(handlerInput, null, 4));
        console.log('AWS UserID ' + getUserId(handlerInput.requestEnvelope));
        console.log('OC AccessToken ' + getAccountLinkingAccessToken(handlerInput.requestEnvelope));
        console.log('API Endpoint ' + handlerInput.requestEnvelope.context.System.apiEndpoint);
        console.log('API AccessToken ' + getApiAccessToken(handlerInput.requestEnvelope));

        var options = {
            'method': 'GET',
            'url': 'https://cloud.vchrist.at/ocs/v2.php/cloud/user?format=json',
            'headers': {
                'Authorization': 'Bearer ' + getAccountLinkingAccessToken(handlerInput.requestEnvelope)
            }
        };

        request.get(options, function (error: any, response: any) {
            if (error) throw new Error(error);
            var oc_data = JSON.parse(response.body);
            console.log('OC Response: ' + JSON.stringify(oc_data, null, 4));

            var sql = `UPDATE wastecalendar.amz_user SET oc_userid = ${db().escape(oc_data.ocs.data.id)}, amz_accountlinked = 1 WHERE amz_userid = ${db().escape(handlerInput.requestEnvelope.context.System.user.userId)}`;
            
            db().query(sql, function (err: any, result: any) {
                if (err) {
                    console.error(err.stack);
                } else {
                    console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
                }
            });
        });
        return handlerInput.responseBuilder.getResponse();
    }
};

const SkillEnabledEventHandler: RequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.SkillEnabled';
    },
    handle(handlerInput) {
        console.log('ALL AlexaSkillEvent.SkillEnabled ' + JSON.stringify(handlerInput, null, 4));
        console.log('AWS UserID ' + getUserId(handlerInput.requestEnvelope));
        console.log('API Endpoint ' + handlerInput.requestEnvelope.context.System.apiEndpoint);

        var sql = `INSERT INTO wastecalendar.amz_user (amz_skillid, amz_userid, amz_apiendpoint, amz_apiaccesstoken) VALUES (
            ${db().escape(handlerInput.requestEnvelope.context.System.application.applicationId)},
            ${db().escape(getUserId(handlerInput.requestEnvelope))},
            ${db().escape(handlerInput.requestEnvelope.context.System.apiEndpoint)},
            ${db().escape(getApiAccessToken(handlerInput.requestEnvelope))}
        )`;
        
        db().query(sql, function (err: any, result: any) {
            if (err) {
                console.error(err.stack);
            } else {
                console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
            }
        });
        return handlerInput.responseBuilder.getResponse();
    }
};

const SkillDisabledEventHandler: RequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'AlexaSkillEvent.SkillDisabled';
    },
    handle(handlerInput) {
        const { requestEnvelope } = handlerInput;

        console.log('ALL AlexaSkillEvent.SkillDisabled ' + JSON.stringify(handlerInput, null, 4));
        console.log('AWS UserID ' + getUserId(requestEnvelope));
        console.log('API Endpoint ' + handlerInput.requestEnvelope.context.System.apiEndpoint);
        //        console.log('Persistence State ' + skillDisabledRequestRequest.body.userInformationPersistenceStatus);

        var sql = `DELETE FROM wastecalendar.amz_user WHERE 
            amz_userid = ${db().escape(getUserId(requestEnvelope))}
            AND amz_skillid = ${db().escape(handlerInput.requestEnvelope.context.System.application.applicationId)}`;

        console.log('SQL: ' + sql);
        db().query(sql, function (err: any, result: any) {
            if (err) {
                console.error(err.stack);
            } else {
                console.log(result.affectedRows + ' record inserted ' + util.inspect(result));
            }
        });
        return handlerInput.responseBuilder.getResponse();
    }
};

//console.log('Test: ' + (typeof hallo == 'undefined') ? 'ja' : 'nein');
// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.

export = SkillBuilders.custom()
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
    .addErrorHandlers(ErrorHandler)
    .withSkillId('amzn1.ask.skill.5119403b-f6c6-45f8-bd7e-87787e6f5da2')
    .create();



/*
var apiConfiguration: services.ApiConfiguration = {
    apiClient: new DefaultApiClient(),
    apiEndpoint: 'hihi',
    authorizationValue: 'Bearer ' + <skill.token>
};


var authenticationConfiguration: services.AuthenticationConfiguration = {
    clientId: 'client',
    clientSecret: 'clientSecret'
};

var pesc = new services.proactiveEvents.ProactiveEventsServiceClient(apiConfiguration, authenticationConfiguration);


let expiryTime = new Date();
expiryTime.setHours(expiryTime.getHours() + 23);

var proactiveEventRequest = {} as services.proactiveEvents.CreateProactiveEventRequest;

proactiveEventRequest.event.name = 'AMAZON.TrashCollectionAlert.Activated';
proactiveEventRequest.event.payload = {
    alert: {
        garbageTypes: ['LANDFILL', 'RECYCLABLE_PLASTICS', 'WASTE_PAPER'],
        collectionDayOfWeek: 'TUESDAY'
    }
};


proactiveEventRequest.expiryTime = expiryTime.toISOString();
//proactiveEventRequest.localizedAttributes
proactiveEventRequest.referenceId = 'wastecalendar-event-' + Date();
proactiveEventRequest.relevantAudience.payload = 'amz:...';
proactiveEventRequest.relevantAudience.type = 'Unicast';
proactiveEventRequest.timestamp = new Date().toISOString(),

pesc.createProactiveEvent(proactiveEventRequest, 'DEVELOPMENT');
*/