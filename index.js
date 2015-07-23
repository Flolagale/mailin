'use strict';
var semver = require('semver');
var pkg = require('./package.json');

/* Check compatibility with versions of node and iojs. */
if (!semver.satisfies(process.version, '~0.12.0') &&
    !semver.satisfies(process.version, '^2.0.0')) {
    console.log('\n*****\nYour current node version (' + process.version +
        ') is not compatible with Mailin v' + pkg.version +
        ' which requires ' + pkg.engine +
        '.\nIf you are running an older version of node, please consider installing ' +
        'Mailin ^2.0.0 (npm install mailin@2.0.0).\n' +
        'Love,\nthe Mailin maintainers. \n*****\n');
}

var mailin = require('./lib/mailin');
module.exports = mailin;
