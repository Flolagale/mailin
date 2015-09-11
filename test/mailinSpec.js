/* jshint expr: true */
'use strict';

var _           = require('lodash');
var express     = require('express');
var fs          = require('fs');
var Mailin      = require('../lib/mailin');
var multiparty  = require('multiparty');
var smtp        = require('smtp-connection');
var shell       = require('shelljs');

var chai            = require('chai');
var chaiAsPromised  = require('chai-as-promised');

chai.use(chaiAsPromised);

var should          = chai.Should();
var mailin;

before(function (done) {
    mailin = new Mailin({
        verbose: true
    });

    mailin.start(function (err) {
      console.log(err);
      should.not.exist(err);
      done();
    });
});

beforeEach(function () {
    mailin.removeAllListeners();
});

describe('Mailin', function () {

  it('should convert an HTML-only message to text', function (done) {
      this.timeout(10000);

      mailin.on('message', function (connection, data) {
        //console.log(data);
        data.text.should.eql('HELLO WORLD\nThis is a line that needs to be at least a little ' +
        'longer than 80 characters so\nthat we can check the character wrapping functionality.' +
        '\n\nThis is a test of a link [https://github.com/Flolagale/mailin] .');
        done();
      });

      /* Make an smtp client to send an email. */
      var client = new smtp({
          port: 2500,
          ignoreTLS: true
      });

      client.connect(function () {
        client.send({
          from: {
              name: 'Me',
              address: 'me@jokund.com'
          },
          to: [{
              name: '',
              address: 'to@jokund.com'
          }]
        }, fs.createReadStream('./test/fixtures/test-html-only.eml'), function (err) {
          console.log(err);
          if (err) {
            done(err);
          }
        });
      });
  });

  describe('email handler', function () {
    it('should parse a base64 encoded email', function (done) {
      mailin.stop(function(err){

        if(err) console.log(err);

        mailin.start({
            verbose: true,
            keepTmpFile: true
        }, function(err){

          if(err) console.log(err);

          var tstone1 = '{"from":"tstone@controlscan.com","to":["mirror@mail.humanexploit.com"],"date":"2015-09-04T18:12:26.165Z","remoteAddress":"::ffff:199.193.204.204","authentication":{"username":false,"authenticated":false,"state":"NORMAL"},"host":"out.West.EXCH082.serverdata.net","mailPath":".tmp/fb66f544876d38ac1d419d0a16828a6e7e96fe9b","mailWriteStream":{"_writableState":{"objectMode":false,"highWaterMark":16384,"needDrain":false,"ending":false,"ended":false,"finished":false,"decodeStrings":true,"defaultEncoding":"utf8","length":0,"writing":false,"corked":0,"sync":true,"bufferProcessing":false,"writecb":null,"writelen":0,"bufferedRequest":null,"lastBufferedRequest":null,"pendingcb":0,"prefinished":false,"errorEmitted":false},"writable":true,"domain":null,"_events":{},"_maxListeners":20,"path":".tmp/fb66f544876d38ac1d419d0a16828a6e7e96fe9b","fd":null,"flags":"w","mode":438,"bytesWritten":0},"id":"41996b0d","level":"debug","message":"replied","timestamp":"2015-09-04T18:12:26.618Z"}';

          var connection = JSON.parse(tstone1);

          connection.mailPath = './test/fixtures/case1-tstone.eml';
          connection.mailWriteStream.path = './test/fixtures/case1-tstone.eml';

          mailin.onDataReady(connection, function(){
            //console.log(report);

            done();
          });

        });
      });
    });
  });

  it('should not validate sender domain DNS by default', function (done) {
        this.timeout(10000);

        mailin.on('message', function (connection, data) {
            data.html.should.eql('<b>Hello world!</b>');
            done();
        });

        /* Make an smtp client to send an email. */

        var client = new smtp({
            port: 2500,
            ignoreTLS: true
        });

        client.connect(function () {
            client.send({
                from: {
                    name: 'Me',
                    address: 'me@jokund.com'
                },
                to: [{
                    name: 'First Receiver',
                    address: 'first@jokund.com'
                }, {
                    name: '',
                    address: 'second@jokund.com'
                }]
            }, fs.createReadStream('./test/fixtures/test.eml'), function (err) {
                done(err);
            });
        });
    });

  /* This test should run as the last test since it restarts mailin with
   * different options. */
  it('should validate sender domain DNS if requested', function (done) {
    this.timeout(10000);

    mailin.stop(function (err) {
      try {
        if (err) console.log(err);
        should.not.exist(err);
      } catch (e) {
        return done(e);
      }

      mailin.start({
          disableDnsValidation: false,
          smtpOptions: {
              disabledCommands: ['AUTH'],
              secure: false
          }
      }, function (err) {
        try {
          if (err) console.log(err);
          should.not.exist(err);
        } catch (e) {
          return done(e);
        }

        var doneEvents = [];
        var registerDoneEvent = function (eventName) {
            doneEvents.push(eventName);
            var remaining = _.xor(doneEvents, ['senderValidationFailed', 'error']);
            if (remaining.length === 0) {
                done();
            }
        };

        mailin.on('senderValidationFailed', function (err) {
            err = err || undefined;
            try {
                should.exist(err);
                err.should.equal('envelopefrom@foo.fifoo');
                registerDoneEvent('senderValidationFailed');
            } catch (e) {
                return done(e);
            }
        });

        /* Make an smtp client to send an email. */
        var client = new smtp({
            port: 2500,
            ignoreTLS: true
        });

        var errorFunction = function (err) {
          err = err || undefined;
          try {
            should.exist(err);
            console.log(err);
            err.response.indexOf('Sender address rejected: Domain not found').should.not.equal(-1);
            registerDoneEvent('error');
          } catch (e) {
            return done(e);
          }
        };

        client.connect(function () {
          client.send({
            from: {
                name: 'Me',
                address: 'envelopefrom@foo.fifoo'
            },
            to: [{
                name: 'First Receiver',
                address: 'first@jokund.com'
            }, {
                name: '',
                address: 'second@jokund.com'
            }]
          }, fs.createReadStream('./test/fixtures/test.eml'), errorFunction);
        });
      });
    });
  });
});
