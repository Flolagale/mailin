'use strict';

var fs = require('fs');

module.exports = function(grunt) {

    // Load .jshintrc file.
    var hintOptions = JSON.parse(fs.readFileSync('.jshintrc', 'utf8'));

    grunt.loadNpmTasks('grunt-jsbeautifier');
    grunt.loadNpmTasks('grunt-contrib-jshint');

    grunt.loadNpmTasks('grunt-mocha-test');

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        jsfiles: [
            'Gruntfile.js',
            'index.js',
            'lib/**/*.js',
            'test/**/*.js',
            '!node_modules/**/*.js'
        ],

        jsbeautifier: {
            files: ['<%= jsfiles %>'],
            options: {
                space_after_anon_function: true
            }
        },

        jshint: {
            options: hintOptions,
            files: ['<%= jsfiles %>']
        },

        mochaTest: {
            test: {
                options: {
                    reporter: 'spec'
                },
                src: ['test/**/*Spec.js']
            }
        },

        watch: {
            files: ['<%= jsfiles %>'],
            tasks: ['test']
        }
    });

    grunt.registerTask('lint', [
        'jsbeautifier',
        'jshint'
    ]);

    grunt.registerTask('test', [
        'lint',
        'mochaTest'
    ]);
};
