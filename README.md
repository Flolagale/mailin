#Mailin

__Artisanal inbound emails for every web app__

Mailin is an smtp server that listen for emails, parse them and post them as json to the url of your choice.
It checks the incoming emails [dkim](http://en.wikipedia.org/wiki/DomainKeys_Identified_Mail), [spf](http://en.wikipedia.org/wiki/Sender_Policy_Framework), spam score (using [spamassassin](http://spamassassin.apache.org/)) and tells you in which language the email is written.

Mailin can be used as a standalone application directly from the command line, or embedded inside a node application.

=======

###Initial setup

####Dependencies

Mailin can run without any dependencies, but having them allow you to use some additional features.

To handle dkim and spf checking, Mailin depends on Python 2.7. On Linux machines, it is very not likely that you don't have a decent version of Python available.

To handle the spam score computation, Mailin depends on spamassassin and its server interface spamc. Both should be available as packages on your machine. For instance on Debian/Ubuntu boxes:
```
sudo aptitude install spamassassin spamc
```

####The crux: setting your DNS correctly

========

###Using Mailin
####From the command line

Install mailin globally.

```
sudo npm install -g mailin
```

Run it, specifying your webhook url (addtionnal help can be found using ```mailin --help```). By default, Mailin will listen on port 25, the standard smtp port. you can change this port for testing purpose using the ```--port``` option. However, do not change this port if you want to receive emails from the real world.

Ports number under 1000 are reserved to root user. So two options here. Either run Mailin as root:
```
sudo mailin --webhook http://mydomain.com/incoming_emails
```
Or, prefered choice, use something like ```authbind``` to run Mailin with a standard user while still using port 25.
Here comes a [tutorial on how to setup authbind](http://respectthecode.tumblr.com/post/16461876216/using-authbind-to-run-node-js-on-port-80-with-dreamhost).

From now on, mailin will listen for incoming emails, parse them and post an urlencoded form ```application/x-www-form-urlencoded``` to your webhook url.

-- webhook format

#####Gotchas
* ```error: listen EACCES```: your user do not have sufficients privileges to run on the given port. Ports under 1000 are restricted to root user. Try with [sudo](http://xkcd.com/149/).
* ```error: listen EADDRINUSE```: The current port is already used by something. Most likely, you are trying to use port 25 and your machine's [mail transport agent](http://en.wikipedia.org/wiki/Message_transfer_agent) is already running. Stop it with something like ```sudo service exim4 stop``` or ```sudo service postfix stop``` before using Mailin.

####Embedded inside a node application

Install Mailin locally.

```
sudo npm install --save mailin
```

Start the Mailin server and listen to events.

```javascript
var mailin = require('mailin');

/* Event emitted when a connection with the Mailin smtp server is initiated. */
mailin.on('startMessage', function (messageInfo) {
  /* messageInfo = {
      from: 'sender@somedomain.com',
      to: 'someaddress@yourdomain.com'
  }; */
  console.log(messageInfo);
});

/* Event emitted after a message was received and parsed.
 * The message parameters contains the parsed email. */
mailin.on('message', function (message) {
  console.log(message);
  /* Do something useful with the parsed message here.
   * Use it directly or modify it and post it to a webhook. */
});

/* Start the Mailin server. The available options are: 
 options = {
    port: 25,
    webhook: 'http://mydomain.com/mailin/incoming,
    disableWebhook: false,
    logFile: '/some/local/path'
 }; */
mailin.start({
  port: 25,
  disableWebhook: true // Disable the webhook posting, so that you do what you want with the parsed message.
});

```
