/* jshint expr: true */
'use strict';

var _ = require('lodash');
var express = require('express');
var fs = require('fs');
var mailin = require('../lib/mailin');
var multiparty = require('multiparty');
var simplesmtp = require('simplesmtp');
var shell = require('shelljs');

var should = null;
should = require('should');

before(function (done) {
    mailin.start({
        verbose: true,
    }, function (err) {
        should.not.exist(err);
        done();
    });
});

beforeEach(function () {
    mailin.removeAllListeners();
});

describe('Mailin', function () {
    it('should post a json to a webhook after receiving an email and trigger some events', function (done) {
        this.timeout(10000);

        var doing = 2; // Number of async operations we need to wait for before calling done

        var expectedSpamScore = 3.3;
        if (!shell.which('spamassassin') || !shell.which('spamc')) {
            console.warn('Spamassassin is not installed. Skipping spam score test.');
            expectedSpamScore = 0;
        }

        /* Add listeners to the events. */
        var connData = null;
        mailin.on('startMessage', function (connection) {
            console.log("Event 'startMessage' triggered.");
            connData = _.pick(connection, ['from', 'to', 'remoteAddress', 'authentication', 'id']);
            console.log(connData);
        });

        mailin.on('message', function (connection, data) {
            console.log("Event 'message' triggered.");
            // console.log(data);

            data.attachments[0].content.toString().should.eql('my dummy attachment contents');

            /* Delete the headers that include a timestamp. */
            delete data.headers.received;

            data.should.eql({
                html: '<b>Hello world!</b>',
                text: 'Hello world!',
                headers: {
                    'x-mailer': 'Nodemailer 1.0',
                    from: '"Me" <me@jokund.com>',
                    to: '"First Receiver" <first@jokund.com>, second@jokund.com',
                    'content-type': 'multipart/mixed; boundary="----mailcomposer-?=_1-1402581589619"',
                    'mime-version': '1.0'
                },
                priority: 'normal',
                from: [{
                    address: 'me@jokund.com',
                    name: 'Me'
                }],
                to: [{
                    address: 'first@jokund.com',
                    name: 'First Receiver'
                }, {
                    address: 'second@jokund.com',
                    name: ''
                }],
                attachments: [{
                    contentType: 'text/plain',
                    fileName: 'dummyFile.txt',
                    contentDisposition: 'attachment',
                    transferEncoding: 'base64',
                    generatedFileName: 'dummyFile.txt',
                    contentId: '6e4a9c577e603de61e554abab84f6297@mailparser',
                    checksum: 'e9fa6319356c536b962650eda9399a44',
                    length: 28,
                    content: new Buffer('my dummy attachment contents'),
                    // contents: [
                    // 109,
                    // 121,
                    // 32,
                    // 100,
                    // 117,
                    // 109,
                    // 109,
                    // 121,
                    // 32,
                    // 97,
                    // 116,
                    // 116,
                    // 97,
                    // 99,
                    // 104,
                    // 109,
                    // 101,
                    // 110,
                    // 116,
                    // 32,
                    // 99,
                    // 111,
                    // 110,
                    // 116,
                    // 101,
                    // 110,
                    // 116,
                    // 115
                    // ]
                }],
                dkim: 'failed',
                envelopeFrom: [{
                    address: "envelopefrom@jokund.com",
                    name: ""
                }],
                envelopeTo: [{
                    address: "envelopeto@jokund.com",
                    name: ""
                }],
                spf: 'failed',
                spamScore: expectedSpamScore,
                language: 'pidgin',
                cc: [],
                connection: connData
            });

            doing--;
        });

        /* Make an http server to receive the webhook. */
        var server = express(),
            conn;
        server.use(server.router);
        server.head('/webhook', function (req, res) {
            res.send(200);
        });
        server.post('/webhook', function (req, res) {
            console.log('Receiving webhook.');

            var form = new multiparty.Form();
            form.parse(req, function (err, fields, files) {
                if (err) console.log(err.stack);
                should.not.exist(err);

                should.exist(files);
                Object.keys(files).length.should.eql(0);

                should.exist(fields);
                should.exist(fields.mailinMsg);
                should.exist(fields['dummyFile.txt']);

                var mailinMsg = JSON.parse(fields.mailinMsg);

                /* Delete the headers that include a timestamp. */
                delete mailinMsg.headers.received;

                /* And the connection id, which is random. */
                delete mailinMsg.data;

                mailinMsg.should.eql({
                    html: '<b>Hello world!</b>',
                    text: 'Hello world!',
                    headers: {
                        'x-mailer': 'Nodemailer 1.0',
                        from: '"Me" <me@jokund.com>',
                        to: '"First Receiver" <first@jokund.com>, second@jokund.com',
                        'content-type': 'multipart/mixed; boundary="----mailcomposer-?=_1-1402581589619"',
                        'mime-version': '1.0'
                    },
                    priority: 'normal',
                    from: [{
                        address: 'me@jokund.com',
                        name: 'Me'
                    }],
                    to: [{
                        address: 'first@jokund.com',
                        name: 'First Receiver'
                    }, {
                        address: 'second@jokund.com',
                        name: ''
                    }],
                    attachments: [{
                        contentType: 'text/plain',
                        fileName: 'dummyFile.txt',
                        contentDisposition: 'attachment',
                        transferEncoding: 'base64',
                        generatedFileName: 'dummyFile.txt',
                        contentId: '6e4a9c577e603de61e554abab84f6297@mailparser',
                        checksum: 'e9fa6319356c536b962650eda9399a44',
                        length: '28'
                    }],
                    dkim: 'failed',
                    envelopeFrom: [{
                        address: 'envelopefrom@jokund.com',
                        name: ''
                    }],
                    envelopeTo: [{
                        address: 'envelopeto@jokund.com',
                        name: ''
                    }],
                    spf: 'failed',
                    spamScore: expectedSpamScore,
                    language: 'pidgin',
                    cc: [],
                    connection: connData
                });

                res.send(200);

                doing--;
            });

            var waiting = setInterval(function () {
                if (!doing) {
                    clearInterval(waiting);
                    conn.close();
                    done();
                }
            }, 1000);
        });
        conn = server.listen(3000, function (err) {
            if (err) console.log(err);
            should.not.exist(err);

            console.log('Http server listening on port 3000');

            /* Make an smtp client to send an email. */
            var client = simplesmtp.connect(2500);

            /* Run only once as 'idle' is emitted again after message delivery. */
            client.once('idle', function () {
                client.useEnvelope({
                    from: 'envelopefrom@jokund.com',
                    to: 'envelopeto@jokund.com'
                });
            });

            client.on('message', function () {
                fs.createReadStream('./test/fixtures/test.eml').pipe(client);
            });
        });
    });

    it('should convert an HTML-only message to text', function (done) {
        this.timeout(10000);

        mailin.on('message', function (connection, data) {
            // console.log(data);
            data.text.should.eql('HELLO WORLD\nThis is a line that needs to be at least a little longer than 80 characters so\nthat we can check the character wrapping functionality.\n\nThis is a test of a link [https://github.com/Flolagale/mailin] .');
            done();
        });

        /* Make an smtp client to send an email. */
        var client = simplesmtp.connect(2500);

        /* Run only once as 'idle' is emitted again after message delivery. */
        client.once('idle', function () {
            client.useEnvelope({
                from: 'envelopefrom@jokund.com',
                to: 'envelopeto@jokund.com'
            });
        });

        client.on('message', function () {
            fs.createReadStream('./test/fixtures/test-html-only.eml').pipe(client);
        });
    });
});
