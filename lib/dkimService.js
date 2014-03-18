'use strict';

var spawn = require('child_process').spawn;

module.exports = {
    validateDkim: function (msg, callback) {
        var verifyDkim = spawn('python', ['python/verifydkim.py']);

        verifyDkim.stdout.on('data', function (data) {
            console.log(data.toString());
        });

        verifyDkim.on('close', function (code) {
            console.log('closed with return code ' + code);
            /* Convert return code to appropriate boolean. */
            return callback(null, !! !code);
        });

        verifyDkim.stdin.write(msg);
        verifyDkim.stdin.end();
    }
};
