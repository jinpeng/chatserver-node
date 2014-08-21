var Busboy = require('busboy');
var uuid = require('node-uuid');
var path = require('path');
var fs = require('fs');
var util = require('util');
var exec = require('child_process').exec;

var Datastore = require('nedb');
var RoomsDB = new Datastore({
    filename: path.join(path.dirname(__filename), '..', 'rooms.db'),
    autoload: true
});

RoomsDB.ensureIndex({
    fieldName: 'publicID',
    unique: true
}, function(err) {
    if (err) {
        console.warn("Unable to create index for 'publicID' property: " + err);
    }
});

var makeURL = function(req, path) {
    return 'http://' + req.get('host') + path;
}

var cleanRoom = function(doc, req) {
    var thechatters = [];
    if (doc.chatters) {
        thechatters = doc.chatters;
    }

    var themessages = [];
    if (doc.messages) {
        themessages = doc.messages;
    }

    return {
        id: doc.publicID,
        name: doc.name,
        chatters: thechatters,
        messages: themessages,
        created: doc.created,
        url: makeURL(req, '/rooms/' + doc.publicID)
    };
}

/**
 * GET /rooms
 */
exports.list = function(req, res) {
    RoomsDB.find({}).sort({
        created: -1
    }).exec(function(err, docs) {
        if (docs) {
            var rooms = docs.map(function(e) {
                return cleanRoom(e, req);
            });

            res.format({
                json: function() {
                    res.json(rooms);
                },
                html: function() {
                    res.render('rooms', {
                        rooms: rooms,
                        timeago: require('timeago-words')
                    });
                }
            });
        } else {
            res.format({
                json: function() {
                    res.status(500).json({
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            });
        }
    });
};

/**
 * GET /rooms/:room_id
 */
exports.get = function(req, res) {
    var roomID = req.params.room_id;
    RoomsDB.find({
        publicID: roomID
    }, function(err, docs) {
        if (docs) {
            var room = cleanRoom(docs[0], req);
            res.format({
                json: function() {
                    res.json(room)
                },
                html: function() {
                    res.render('room', {
                        room: room,
                        timeago: require('timeago-words')
                    });
                }
            });
        } else {
            res.format({
                json: function() {
                    res.status(500).json({
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            })
        }
    });
};

/**
 * POST /rooms
 */
exports.add = function(req, res) {
    console.log('Start processing room.add!');
    console.log(JSON.stringify(req.headers));
    console.log(req.body, req.files);

    var id = uuid.v1();
    var room = {
        publicID: id,
        created: new Date()
    };

    if (req.body['room']) {
        room.name = req.body['room']['name'];
        console.log("creating room with name: " + room.name);

        RoomsDB.insert(room, function(err, newDoc) {
            if (err === null) {
                res.format({
                    json: function() {
                        room.id = id;
                        room.name = req.body['room']['name'];
                        res.status(201).json(room);
                    },
                    html: function() {
                        res.writeHead(303, {
                            Connection: 'close',
                            Location: '/rooms/' + id
                        });
                        res.end();
                    }
                })
            }
        });
    } else {
        console.log('Parsing with busboy...');
        var busboy = new Busboy({
            headers: req.headers
        });
        busboy.on('field', function(fieldname, value, fieldnameTruncated, valueTruncated) {
            console.log('Parsing form: ' + fieldname);
            if (fieldname === 'name') {
                room.name = value;
            } else {
                console.warn("Unknown field: " + fieldname);
            }
        });
        busboy.on('finish', function() {
            RoomsDB.insert(room, function(err, newDoc) {
                if (err === null) {
                    res.format({
                        json: function() {
                            room.id = id;
                            res.status(201).json(room);
                        },
                        html: function() {
                            res.writeHead(303, {
                                Connection: 'close',
                                Location: '/rooms/' + id
                            });
                            res.end();
                        }
                    })
                }
            });
        });
        req.pipe(busboy);
    }

};

/**
 * DELETE /rooms/:room_id
 */
exports.delete = function(req, res) {
  var roomID = req.params.room_id;
  RoomsDB.remove({ publicID: roomID }, {}, function(err, numRemoved) {
    if (err) {
      res.format({
        json: function() {
          res.status(500).json({ error: err });
        },
        html: function() {
          res.send(500, err);
        }
      });
    }
    else {
      res.format({
        json: function() {
          res.status(200).json({});
        },
        html: function() {
          res.redirect('/rooms');
        }
      });
    }
  });
}

/**
 * DELETE /rooms
 */
exports.deleteAll = function(req, res) {
    RoomsDB.remove({}, {}, function(err, numRemoved) {
        res.format({
            json: function() {
                res.json({ removed: numRemoved });
            },
            html: function() {
                res.render('rooms', {
                    rooms: [],
                    timeago: require('timeago-words')
                });
            }
        });
    });
}

/**
 * PUT /rooms/:room_id/chatters/:user_id/chattername/:user_name
 */
exports.joinRoom = function(req, res) {
    console.log(JSON.stringify(req.headers));
    console.log(req.body, req.files);
    var roomID = req.params.room_id;
    var userID = req.params.user_id;
    var userName = req.params.user_name;
    console.log("REQ -- chatter: " + userID + "--" + userName + ", room: " + roomID);

    RoomsDB.find({
        publicID: roomID
    }, function(err, docs) {
        if (docs) {
            var room = cleanRoom(docs[0], req);
            console.log("DB -- chatters: " + room.chatters + " is Array: " + Array.isArray(room.chatters));
            room.chatters.push({id:userID, name:userName});
            console.log("adding chatters: " + room.chatters + " to room: " + room.name);
            RoomsDB.update({ publicID: roomID },
                            { $set: { chatters: room.chatters } },
                            {},
                            function (err, numReplaced, newDoc) {
                                if (!err) {
                                    res.format({
                                        json: function() {
                                            res.status(201).json(room);
                                        },
                                        html: function() {
                                            res.render('room', {
                                                room: room,
                                                timeago: require('timeago-words')
                                            });
                                        }
                                    });
                                } else {
                                    res.format({
                                        json: function() {
                                            res.status(500).json({
                                                error: err
                                            });
                                        },
                                        html: function() {
                                            res.write(500, err);
                                        }
                                    })
                                    console.warn("Unable to update " + roomID + ": " + err);
                                }
                            });
        } else {
            res.format({
                json: function() {
                    res.status(500).json({
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            })
        }
    });
}

/**
 * DELETE /rooms/:room_id/chatters/:user_id
 */
exports.leaveRoom = function(req, res) {
    var roomID = req.params.room_id;
    var userID = req.params.user_id;
    RoomsDB.find({
        publicID: roomID
    }, function(err, docs) {
        if (docs) {
            var room = cleanRoom(docs[0], req);
            console.log("room.chatters: " + room.chatters);
            var index = room.chatters.indexOf(userID);
            if (index) {
                room.chatters.splice(index, 1)
                RoomsDB.update({ publicID: roomID },
                            { $set: { chatters: room.chatters } },
                            {},
                            function (err, numReplaced, newDoc) {
                                if (!err) {
                                    res.format({
                                        json: function() {
                                            res.status(201).json(room);
                                        },
                                        html: function() {
                                            res.render('room', {
                                                room: room,
                                                timeago: require('timeago-words')
                                            });
                                        }
                                    });
                                } else {
                                    res.format({
                                        json: function() {
                                            res.status(500).json({
                                                error: err
                                            });
                                        },
                                        html: function() {
                                            res.write(500, err);
                                        }
                                    })
                                    console.warn("Unable to update " + roomID + ": " + err);
                                }
                            });
            }
        } else {
            res.format({
                json: function() {
                    res.status(500).json({
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            })
        }
    });
}

/**
 * GET /rooms/:room_id/messages
 * GET /rooms/:room_id/messages?since=messageID
 */
exports.getMessages = function(req, res) {
    var roomID = req.params.room_id;
    RoomsDB.find({
        publicID: roomID
    }, function(err, docs) {
        if (docs) {
            var room = cleanRoom(docs[0], req);
            var messages = room.messages;
            if (req.query.since) {
                var messageID = req.query.since;
                var isIDEquals = function(x) { return x.id === messageID; };
                var messageTimestamp = messages.filter(isIDEquals)[0].timestamp;
                console.log(messageTimestamp);
                var isLater = function(x) { return x.timestamp > messageTimestamp; };
                messages = messages.filter(isLater);
                console.log(messages);
            }

            res.format({
                json: function() {
                    res.json(messages);
                },
                html: function() {
                    res.render('room', {
                        room: room,
                        timeago: require('timeago-words')
                    });
                }
            });
        } else {
            res.format({
                json: function() {
                    res.status(500).json({
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            })
        }
    });
}


/**
 * POST /rooms/:room_id/messages
 */
exports.postMessages = function(req, res) {
    console.log(JSON.stringify(req.headers));
    console.log(req.body, req.files);

    var err = "unknown";
    var roomID = req.params.room_id;
    RoomsDB.find({
        publicID: roomID
    }, function(err, docs) {
        if (docs) {
            var room = cleanRoom(docs[0], req);
            var id = uuid.v1();
            var message = {
                id: id,
                publicID: id,
                timestamp: new Date()
            };
            if (req.body['message']) {
                message.type = req.body['message']['type'];
                message.text = req.body['message']['text'];
                message.author = req.body['message']['author'];
                message.authorID = req.body['message']['authorID'];

                room.messages.push(message);
                RoomsDB.update({ publicID: roomID },
                                { $set: { messages: room.messages } },
                                {},
                                function (err, numReplaced, newDoc) {
                                    if (!err) {
                                        res.format({
                                            json: function() {
                                                res.status(201).json(room);
                                            },
                                            html: function() {
                                                res.render('room', {
                                                    room: room,
                                                    timeago: require('timeago-words')
                                                });
                                            }
                                        });
                                    } else {
                                        res.format({
                                            json: function() {
                                                res.status(500).json({
                                                    error: err
                                                });
                                            },
                                            html: function() {
                                                res.write(500, err);
                                            }
                                        })
                                        console.warn("Unable to update " + roomID + ": " + err);
                                    }
                                });
            } else {
                res.format({
                    json: function() {
                        res.status(400).json({
                            error: err
                        });
                    },
                    html: function() {
                        res.write(400, err);
                    }
                })
            }
        } else {
            res.format({
                json: function() {
                    res.status(500).json({
                        error: err
                    });
                },
                html: function() {
                    res.write(500, err);
                }
            })
        }
    });
}

