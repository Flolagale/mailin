/* jshint expr: true */
'use strict';

var _           = require('lodash');
var express     = require('express');
var fs          = require('fs');
var Mailin      = require('../lib/mailin');
var multiparty  = require('multiparty');
var simplesmtp  = require('simplesmtp');
var shell       = require('shelljs');
var should      = require('should');
var mailin;

before(function (done) {
    mailin = new Mailin({
        verbose: true,
        keepTmpFile: true
    });

    mailin.start(function (err) {
        should.not.exist(err);
        done();
    });
});

beforeEach(function () {
    mailin.removeAllListeners();
});

describe('Mailin', function () {

    describe('email handler', function () {
        it('should parse a base64 encoded email', function (done) {

            var tstone1 = '{"from":"tstone@controlscan.com","to":["mirror@mail.humanexploit.com"],"date":"2015-09-04T18:12:26.165Z","remoteAddress":"::ffff:199.193.204.204","authentication":{"username":false,"authenticated":false,"state":"NORMAL"},"host":"out.West.EXCH082.serverdata.net","mailPath":".tmp/fb66f544876d38ac1d419d0a16828a6e7e96fe9b","mailWriteStream":{"_writableState":{"objectMode":false,"highWaterMark":16384,"needDrain":false,"ending":false,"ended":false,"finished":false,"decodeStrings":true,"defaultEncoding":"utf8","length":0,"writing":false,"corked":0,"sync":true,"bufferProcessing":false,"writecb":null,"writelen":0,"bufferedRequest":null,"lastBufferedRequest":null,"pendingcb":0,"prefinished":false,"errorEmitted":false},"writable":true,"domain":null,"_events":{},"_maxListeners":20,"path":".tmp/fb66f544876d38ac1d419d0a16828a6e7e96fe9b","fd":null,"flags":"w","mode":438,"bytesWritten":0},"id":"41996b0d","level":"debug","message":"replied","timestamp":"2015-09-04T18:12:26.618Z"}';

            var connection = JSON.parse(tstone1);

            connection.mailPath = connection.mailWriteStream.path = './test/fixtures/case1-tstone.eml';

            mailin.onDataReady(connection, function(){
              //console.log(report);

              done();
            });
        });
    });

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
            //console.log(data);

            data.attachments[0].fileName.should.eql('dummyFile.txt');

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
                    length: 28
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
            console.log(data);
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

    it('should not validate sender domain DNS by default', function (done) {
        this.timeout(10000);

        mailin.on('message', function (connection, data) {
            data.html.should.eql('<b>Hello world!</b>');
            done();
        });

        /* Make an smtp client to send an email. */
        var client = simplesmtp.connect(2500);

        /* Run only once as 'idle' is emitted again after message delivery. */
        client.once('idle', function () {
            client.useEnvelope({
                from: 'envelopefrom@foo.fifoo',
                to: 'envelopeto@foo.fifoo'
            });
        });

        client.on('message', function () {
            fs.createReadStream('./test/fixtures/test.eml').pipe(client);
        });
    });

    /* This test should run as the last test since it restarts mailin with
     * different options. */
    it('should validate sender domain DNS if requested', function (done) {
        this.timeout(10000);

        mailin.stop(function (err) {
            if (err) console.log(err);
            should.not.exist(err);

            mailin.start({
                smtpOptions: {
                    disableDNSValidation: false
                }
            }, function (err) {
                if (err) console.log(err);
                should.not.exist(err);

                var doneEvents = [];
                var registerDoneEvent = function (eventName) {
                    doneEvents.push(eventName);

                    /* Call done if all the events of the test have been called. */
                    var shouldCallDone = ['senderValidationFailed', 'error'].every(function (eventName) {
                        return _.contains(doneEvents, eventName);
                    });

                    if (shouldCallDone) return done();
                };

                mailin.on('senderValidationFailed', function (err) {
                    should.exist(err);
                    err.should.equal('envelopefrom@foo.fifoo');
                    registerDoneEvent('senderValidationFailed');
                });

                /* Make an smtp client to send an email. */
                var client = simplesmtp.connect(2500);

                /* Run only once as 'idle' is emitted again after message delivery. */
                client.once('idle', function () {
                    client.useEnvelope({
                        from: 'envelopefrom@foo.fifoo',
                        to: 'envelopeto@foo.fifoo'
                    });
                });

                client.on('error', function (err) {
                    should.exist(err);
                    console.log(err);
                    err.data.indexOf('Sender address rejected: Domain not found').should.not.equal(-1);
                    registerDoneEvent('error');
                });

                client.on('message', function () {
                    fs.createReadStream('./test/fixtures/test.eml').pipe(client);
                });
            });
        });
    });
});
