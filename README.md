#Mailin

__Artisanal inbound emails for every web app__
<img align="right" src="postman.jpg"/>

Mailin is an smtp server that listen for emails, parse them and post them as json to the url of your choice.
It checks the incoming emails [dkim](http://en.wikipedia.org/wiki/DomainKeys_Identified_Mail), [spf](http://en.wikipedia.org/wiki/Sender_Policy_Framework), spam score (using [spamassassin](http://spamassassin.apache.org/)) and tells you in which language the email is written.

Mailin can be used as a standalone application directly from the command line, or embedded inside a node application.

=======

###Initial setup

####Dependencies

Mailin can run without any dependencies other than node itself, but having them allow you to use some additional features.

So first make sure the node is available, and the ```node``` command as well. On Debian/Ubuntu boxes:
```
sudo aptitude install nodejs ; sudo ln -s $(which nodejs) /usr/bin/node
```

To handle dkim and spf checking, Mailin depends on Python 2.7. On Linux machines, it is very not likely that you don't have a decent version of Python available.

To handle the spam score computation, Mailin depends on spamassassin and its server interface spamc. Both should be available as packages on your machine. For instance on Debian/Ubuntu boxes:
```
sudo aptitude install spamassassin spamc
```

####The crux: setting up your DNS correctly

In order to receive emails, your smtp server address should be made available somewhere. Three records should be added to your DNS records. Let us pretend that we want to receive emails at ```*@subdomain.domain.com```:
* Add an MX record: ```subdomain.domain.com MX 10 mxsubdomain.domain.com```. This means that the mail server for addresses like ```*@subdomain.domain.com``` will be ```mxsubdomain.domain.com```.
* Add an A record: ```mxsubdomain.domain.com A the.ip.address.of.your.mailin.server```. This tells at which ip address the mail server can be found.
* Finally, add a CNAME record for you email address domain: ```subdomain.domain.com CNAME mxsubdomain.domain.com```. Note that if we did the setup for a top level domain (no subdomain, email addresses such as ```*@domain.com```), this last record should have been an A record towards the real ip address of your mail server box (the same as the second record we set up).

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

From now on, mailin will listen for incoming emails, parse them and post an urlencoded form ```multipart/form-data``` to your webhook url.

-- webhook format

#####Gotchas
* ```error: listen EACCES```: your user do not have sufficients privileges to run on the given port. Ports under 1000 are restricted to root user. Try with [sudo](http://xkcd.com/149/).
* ```error: listen EADDRINUSE```: the current port is already used by something. Most likely, you are trying to use port 25 and your machine's [mail transport agent](http://en.wikipedia.org/wiki/Message_transfer_agent) is already running. Stop it with something like ```sudo service exim4 stop``` or ```sudo service postfix stop``` before using Mailin.
* ```node: command not found```: most likely, your system does not have node installed or it is installed with a different name. For instance on Debian/Ubuntu, the node interpreter is called nodejs. The quick fix is making a symlink: ```ln -s $(which nodejs) /usr/bin/node``` to make the node command available.

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

Notice: Postman image copyright [Charlie Allen](http://charlieallensblog.blogspot.fr)
