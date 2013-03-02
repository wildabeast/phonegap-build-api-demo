var client = require('phonegap-build-api'),
    config = require('./config'),
    fs 	   = require('fs'),
    path   = require('path'),
    events = require('events');

var PGB = function() {
	this.api = null;
    this.timer = null;
    this.output_dir = path.join(__dirname, 'temp');
    this.oncomplete = null;
    this.done = {
    	'android': false,
    	'ios': false
    };

    this.on('buildComplete', this.download);
    this.on('authComplete', this.build);
};

PGB.prototype = new events.EventEmitter();

PGB.prototype.log = function(s) {
    console.log('[PGB] ' + s);
};

PGB.prototype.auth = function() {
	var self = this;
    client.auth({ username: config.username, password: config.password }, function(e, api) {
        if (e) {
            self.log(e);
        } else {
        	self.log('Authorization successful');
            self.api = api;
            self.emit('authComplete', e, api);
        }
    });
};

PGB.prototype.build = function() {
	this.done['ios'] = false;
	this.done['android'] = false;

    var options = {
        form: {
            data: {
                title: 'Build API Test',
                create_method: 'remote_repo',
                repo: config.app_git
                //keys: { ios: { id: 20088, password: "" }}
            }
        }
    };

    var self = this;

    this.api.post('/apps', options, function(e, data) {
        if (e) {
            self.log(e);
        } else {
            self.log('App created.');
            self.log('Waiting for build...');
            self.poll(data.id, 'android');
            self.poll(data.id, 'ios');
        }
    });
};

PGB.prototype.poll = function(id, platform) {
	var self = this;
    this.checkStatus(id, function(e, data) {
        if (data.status[platform] == 'pending') {
            setTimeout(function() {
                self.poll.call(self, id, platform);
            }, 2000);
        } else if (data.status[platform] == 'complete' ) {
            self.log(platform + ' build complete.');
            self.done[platform] = true;
            self.emit('buildComplete', id, platform);
        } else {
            self.log(platform + " error: " + data.error[platform]);
            self.done[platform] = true;
        }
    });
};

PGB.prototype.checkStatus =function(id, cb) {
    this.api.get('/apps/' + id, cb);
};

PGB.prototype.download =function(id, platform) {
    this.log('Downloading ' + platform + ' app...');
    if (!fs.existsSync(this.output_dir))
    	fs.mkdirSync(this.output_dir);

    var binpath = path.join(this.output_dir, platform + '-' + id + (platform == 'android' ? '.apk' : '.ipa'));
    if (fs.existsSync(binpath))
    	fs.rmSync(binpath);

    var r = this.api.get('/apps/' + id + '/' + platform).pipe(fs.createWriteStream(binpath));
    var self = this;
    r.on('close', function() {
        self.log('Download stream closed.');
        if (!!self.done['android'] && !!self.done['ios']) {
        	self.api.del('/apps/' + id, function(e, data) {
                if (e) {
                    self.log(e);
                } else {
                    self.log('App deleted from Build.');
                }
            });
        }
    });

};

PGB.prototype.run =function() {
	this.auth();
};

new PGB().run();


