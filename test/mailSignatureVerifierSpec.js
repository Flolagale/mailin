/* jshint expr: true */
'use strict';

var mailSignatureVerifier = require('../lib/mailSignatureVerifier');

var should = null;
should = require('should');

describe('The mail signature verfier', function () {
    it('should be able to verify the spf for a given ip, address and host',
        function (done) {
            mailSignatureVerifier.validateSpf('180.73.166.174',
                'someone@gmail.com', 'gmail.com', function (err, isSpfValid) {
                    if (err) console.log(err);
                    should.not.exist(err);
                    isSpfValid.should.not.be.true;
                    done();
                });
        });
});
