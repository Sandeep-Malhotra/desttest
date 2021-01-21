'use strict';

const oauthClient = require('client-oauth2');
const request = require('request-promise');

const express = require('express');
const app = express();

const cfenv = require("cfenv");

const appEnv = cfenv.getAppEnv();
const credentials = appEnv.getServiceCreds('sm-dest-service');
const destClientId = credentials.clientid;
const destClientSecret = credentials.clientsecret;
const destUri = credentials.uri; //https://destination-configuration.cfapps.eu10.hana.ondemand.com
const destAuthUrl = credentials.url;//https://bssubaccount.authentication.eu10.hana.ondemand.com 

// destination service is protected with OAuth 
const _getTokenForDestinationService = function () {
    return new Promise((resolve, reject) => {
        let tokenEndpoint = destAuthUrl + '/oauth/token';
        const client = new oauthClient({
            accessTokenUri: tokenEndpoint,
            clientId: destClientId,
            clientSecret: destClientSecret,
            scopes: []
        });
        client.credentials.getToken()
            .catch((error) => {
                return reject({ message: 'Error: failed to get access token for Destination service', error: error });
            })
            .then((result) => {
                resolve({ message: 'Successfully fetched token for Destination service.', tokenInfo: result });
            });
    });
}

// call the REST API of the Cloud Foundry Destination service to get the configuration info as configured in the cloud cockpit
const _getDestinationConfig = function (destinationName, authorizationHeaderValue) {
    return new Promise(function (resolve, reject) {
        let fullDestinationUri = destUri + '/destination-configuration/v1/destinations/' + destinationName;
        const options = {
            url: fullDestinationUri,
            resolveWithFullResponse: true,
            headers: { Authorization: authorizationHeaderValue }
        };
        // do HTTP call 
        request(options)
            .catch((error) => {
                return reject({ message: 'Error occurred while calling Destination service', error: error });
            })
            .then((response) => {
                if (response && response.statusCode == 200) {
                    let jsonDestInfo = JSON.parse(response.body);
                    return resolve({ message: 'Successfully called Destination service.', destinationInfo: jsonDestInfo });
                } else {
                    reject('Error: failed to call destination service. ' + response.body);
                }
            });
    });
};

const _doQUERY = function (serviceUrl, authorizationHeaderValue) {
    return new Promise(function (resolve, reject) {
        const options = {
            url: serviceUrl + 'srv/user',
            resolveWithFullResponse: true,
            headers: {
                Authorization: authorizationHeaderValue,
                Accept: 'application/json'
            }
        };

        request(options)
            .then((response) => {
                if (response && response.statusCode == 200) {
                    resolve({ responseBody: response.body });
                }
                return reject({ message: 'Error while calling OData service' });
            })
            .catch((error) => {
                reject({ message: 'Error occurred while calling OData service', error: error });
            });
    });
};

// server response
app.get('/', function (req, res) {
    // 1a) get access token for destination service
    _getTokenForDestinationService()
        .then(result => {
            // 1b) call the destination service 
            return _getDestinationConfig('SM_TEST', result.tokenInfo.tokenType + ' ' + result.tokenInfo.accessToken);
        })
        .then(result => {
            let bsApiUrl = result.destinationInfo.destinationConfiguration.URL;
            let tokenTypeForBsApi = result.destinationInfo.authTokens[0].type;  // type is 'bearer'
            let tokenForBsApi = result.destinationInfo.authTokens[0].value;
        // 2. call BS-API with Url + oauth token retrieved from destination

        return _doQUERY(bsApiUrl, tokenTypeForBsApi + ' ' + tokenForBsApi);  
    })   
    .then(result => {
                res.send('<h2>RESULT of request to Backend service:</h2>OData service response: <p>' + JSON.stringify(result.responseBody) + '</p>');
            })
                // responseBody
                .catch(error => {
                    res.send('ERROR: ' + error.message + ' - FULL ERROR: ' + error.error);
                });
        });

    // start the server
    app.listen(process.env.PORT, function () { // env variable PORT is set by Cloud Foundry
    })