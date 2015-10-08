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
    verbose: false
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
          verbose: false,
          logLevel: 'error',
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
