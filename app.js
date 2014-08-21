#!/usr/bin/env node --harmony

/**
 * Module dependencies.
 */

var express = require('express');
var favicon = require('serve-favicon');
var bodyParser = require('body-parser')
var methodOverride = require('method-override')
var morgan = require('morgan')
var errorhandler = require('errorhandler')
var routes = require('./routes');
var user = require('./routes/user');
var room = require('./routes/room');
var video = require('./routes/video');
var http = require('http');
var path = require('path');
var fs = require('fs');

var app = express();

// all environments
app.set('port', process.env.PORT || 3020);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(morgan('combined'))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(methodOverride('X-HTTP-Method-Override'))
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
    app.use(errorhandler())
}

app.get('/', routes.index);
app.get('/users', user.list);
app.post('/users', user.add);
app.get('/users/:user_id', user.get);
app.delete('/users/:user_id', user.delete);

app.put('/account', user.login);
app.delete('/account/:user_id', user.logout);

app.get('/rooms', room.list);
app.post('/rooms', room.add);
app.delete('/rooms', room.deleteAll);
app.get('/rooms/:room_id', room.get);
app.delete('/rooms/:room_id', room.delete);
app.put('/rooms/:room_id/chatters/:user_id/chattername/:user_name', room.joinRoom);
app.delete('/rooms/:room_id/chatters/:user_id', room.leaveRoom);
app.get('/rooms/:room_id/messages', room.getMessages);
app.post('/rooms/:room_id/messages', room.postMessages);

app.get('/videos', video.list);
app.post('/videos', video.add);
app.get('/videos/:video_id', video.get);
app.delete('/videos/:video_id', video.delete);
app.put('/videos/:video_id/movie', video.uploadMovie);

// make sure we have a 'public/videos' directory
var videosDir = path.join(__dirname, 'public/videos');
if (! fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, 0755);
};

var server = http.createServer(app);
var util = require('util');
server.setTimeout(5 * 60 * 1000, function() {
  console.log("TIMEOUT args: " + util.inspect(arguments));
});
server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
