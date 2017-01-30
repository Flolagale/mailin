/* jshint expr: true */
'use strict';

var fs = require('fs');
var shell = require('shelljs');
var mailUtilities = require('../lib/mailUtilities');

var should = null;
should = require('should');

describe('The mail signature verfier', function () {
    it('should be able to verify the spf for a given ip, address and host',
        function (done) {
            mailUtilities.validateSpf('180.73.166.174',
                'someone@gmail.com', 'gmail.com',
                function (err, isSpfValid) {
                    if (err) console.log(err);
                    should.not.exist(err);
                    isSpfValid.should.not.be.true;
                    done();
                });
        });

    it('should be able to compute a spam score for an email', function (done) {
        if (!shell.which('spamassassin') || !shell.which('spamc')) {
            console.warn('Spamassassin is not installed. Skipping spam score test.');
            return done();
        }

        var email = fs.readFileSync('./test/fixtures/test.eml').toString();
        mailUtilities.computeSpamScore(email, function (err, result) {
            if (err) console.log(err);
            should.not.exist(err);

            result.should.eql(3.3);
            done();
        });
    });
});

describe('The mailhops verfier', function () {
    it('should be able to verify the route',
        function (done) {
          var email = fs.readFileSync('./test/fixtures/test.eml').toString();
            mailUtilities.getMailHops(email, "", function (err, result) {
              if (err) console.log(err);
              should.not.exist(err);

              result.response.route.length.should.eql(2);
              result.response.route[0].ip.should.eql('68.232.195.239');
              done();
          });
        });
});
