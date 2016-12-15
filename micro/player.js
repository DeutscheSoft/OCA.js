(function (w) {
"use strict"

/* BEGIN CONFIGURATION */
var sources = [
    {
        files: [ "audio/Drums.wav.mp3", "audio/Drums.wav.ogg" ],
        loop: true,
        id: "drums"
    },
    {
        files: [ "audio/Bass.wav.mp3", "audio/Bass.wav.ogg" ],
        loop: true,
        id: "bass"
    },
    {
        files: [ "audio/FX.wav.mp3", "audio/FX.wav.ogg" ],
        loop: true,
        id: "fx"
    },
    {
        files: [ "audio/Pad.wav.mp3", "audio/Pad.wav.ogg" ],
        loop: true,
        id: "pad"
    },
    {
        files: [ "audio/Arpeggio.wav.mp3", "audio/Arpeggio.wav.ogg" ],
        loop: true,
        fx: ["filter"],
        id: "arpeggio"
    },
    {
        files: [ "audio/Claves.wav.mp3", "audio/claves.wav.ogg" ],
        id: "claves"
    },
    {
        files: [ "audio/Clap.wav.mp3", "audio/Clap.wav.ogg" ],
        id: "clap"
    },
    {
        files: [ "audio/Crash.wav.mp3", "audio/Crash.wav.ogg" ],
        id: "crash"
    }
];


var callbacks = {
    sourcestart: function (s) {
        console.log("start", s)
    },
    sourcestop: function (s) {
        console.log("stop", s)
    }
}
/* END OF CONFIGURATION */

var init = function () {
    w.ctx = new (window.AudioContext || window.webkitAudioContext)();
    w.player = new Player(sources, ctx);
    w.ui = new UI(w.player, callbacks);
    w.simu = new Simulation();
}


var Player = function (sources, ctx, callbacks) {
    
    this.ctx = ctx;
    this.sources = sources || [];
    this.started = false;
    this.UI = {};
    
    this.init = function () {
        
        // Analyzer
        this.analyzer = this.ctx.createAnalyser();
        this.analyzer.fftSize = 32;
        this.analyzer_data = new Float32Array(this.analyzer.frequencyBinCount);
        
        // Filter
        this.filter = this.ctx.createBiquadFilter();
        this.filter.frequency.value = 750;
        this.filter.Q.value = 5;
        
        // Mixer
        this.mixer = this.ctx.createChannelMerger(16);
        
        // Master
        this.master = this.ctx.createGain();
        
        // Compressor
        this.compressor = this.ctx.createDynamicsCompressor();
        
        // Connect
        this.analyzer.connect(this.master);
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
        
        // Sources
        var l = this.sources.map(function (a) { return a.files; });
        var p = Promise.all(l.map(load_sound_file));
        p.then((function(b) {
            document.body.classList.remove("loading");
            for (var i = 0; i < b.length; i++) {
                var s = this.sources[i];
                s.buffer = b[i];
                s.gain = this.ctx.createGain();
                s.gain.connect(this.analyzer);
                s.player = this;
                s.id = i;
                if (s.loop) {
                    s.started = true;
                }
            }
        }).bind(this),
        function(err) {
            console.warn(err);
        });
    }
    
    /* API */
    
    this.start = function () {
        for (var i = 0; i < this.sources.length; i++) {
            var s = this.sources[i]
            if (s.loop)
                this.run_source(s);
        }
        this.started = true;
    }
    this.stop = function () {
        for (var i = 0; i < this.sources.length; i++) {
            if (this.sources[i].loop)
                this.stop_source(this.sources[i]);
        }
        this.started = false;
    }
    
    this.get_analyzer = function () {
        this.analyzer.getFloatFrequencyData(this.analyzer_data);
        return this.analyzer_data;
    }
    
    this.set_filter = function (f) {
        this.filter.frequency = f;
    }
    
    this.set_master = function (v) {
        this.master.gain.value = v;
    }
    
    this.set_source = function (id, v) {
        var s = this.sources[id];
        if (s.loop) {
            s.gain.gain.value = v ? 1 : 0;
            s.started = !!v;
        } else {
            if (v) this.run_source(s);
            else this.stop_source(s);
        }
    }
    
    
    /* helpers */
    
    this.run_source = function (s) {
        s.source = this.ctx.createBufferSource();
        s.source.buffer = s.buffer;
        s.source.loop = s.loop;
        var last = s.source;
        if (s.fx) {
            for (var i = 0; i < s.fx.length; i++) {
                last.connect(this[s.fx[i]]);
                last = this[s.fx[i]];
            }
        }
        last.connect(s.gain);
        s.source.start(0);
        s.started = !!s.gain.gain.value;
    }
    this.stop_source = function (s) {
        s.source.stop();
        s.started = false;
    }
    
    /* initialize */
    this.init();
}


var UI = function (player, callbacks) {
    
    this.player = player;
    this.sources = player.sources;
    this.callbacks = callbacks || {};
    
    this.init = function () {
        this.node = element("div", {id:"player"}, document.body);
            
        this.toggle = element("div", {id:"toggle"}, this.node);
        this.toggle.onclick = (function (e) {
            if (this.player.started) {
                this.player.stop();
                this.node.classList.remove("started");
            } else {
                this.player.start();
                this.node.classList.add("started");
            }
        }).bind(this);
        
        this.scont = element("div", {id:"sources"}, this.node);
        for (var i = 0; i < this.sources.length; i++) {
            var s = this.sources[i];
            var e = element("div", {
                "class":"source",
                id: s.id ? s.id : "source_" + i
            }, this.scont);
            if (s.loop)
                e.classList.add("loop", "started");
            else
                e.classList.add("oneshot");
            var down = (function (src, that) {
                return function (e) {
                    e.preventDefault();
                    if (src.loop) {
                        that.player.set_source(src.id, src.started ? 0 : 1);
                        that.set_source(src.id, src.started ? 1 : 0);
                    } else {
                        that.player.set_source(src.id, 1);
                        that.set_source(src.id, 1);
                    }
                    if (that.callbacks.sourcestart && src.started)
                        that.callbacks.sourcestart(src);
                    if (that.callbacks.sourcestop && !src.started)
                        that.callbacks.sourcestop(src);
                }
            })(s, this);
            //var up = (function (src, that) {
                //return function (e) {
                    //e.preventDefault();
                    //if (that.callbacks.sourcestop)
                        //that.callbacks.sourcestop(src);
                //}
            //})(s, this);
            e.touchstart = down;
            e.onmousedown = down;
            s.element = e;
        }
    }
    
    this.set_source = function (id, v) {
        var s = this.sources[id];
        if (s.loop)
            s.element.classList[ v ? "add" : "remove"]("started");
        else {
            s.element.classList.add("started");
            if (s.timeout >= 0)
                clearTimeout(s.timeout);
            s.timeout = setTimeout(function () {
                s.element.classList.remove("started");
                s.timeout = -1;
            }, 250);
        }
    }
    
    this.init();
}


var Simulation = function () {
    this.init = function () {
        
    }
    
    this.init();
}




/* WEB AUDIO */
function load_sound_file(url) {
    if (!url.length) {
        console.warn("giving up");
        return Promise.reject("Could not find any working codec.");
    }

    var load_file = function() {
        return new Promise(function (resolve, reject) {
            var request = new XMLHttpRequest();

            request.open('GET', url[0], true);
            request.responseType = 'arraybuffer';

            request.onload = function() {
                if (this.status >= 200 && this.status < 300) {
                    resolve(this.response);
                } else {
                    url = url.slice(1);
                    if (!url.length) reject(this.statusText);
                    else resolve(load_file());
                }
            };
            request.onerror = function(err) {
                console.warn('Could not load ', url[0], 'status:', this.statusText);
                url = url.slice(1);
                if (!url.length) reject(err);
                else resolve(load_file());
            };
            request.send();
        });
    };

    return load_file().then(function(buffer) {
        return new Promise(function (resolve, reject) {
            ctx.decodeAudioData(buffer, function (buffer) {
                resolve(buffer);
            }, function(error) {
                console.warn('Could not decode file', url[0]);
                resolve(load_sound_file(url.slice(1)));
            });
        });
    });
}

/* STUFF & TOOLS */

w.element = function (type, attrs, parent) {
    attrs = attrs || {};
    var e = document.createElement(type);
    for (var i in attrs)
        e.setAttribute(i, attrs[i]);
    if (parent)
        parent.appendChild(e);
    return e;
}

w.getID = function (id) {
    return document.getElementById(id);
}
w.screenWidth = function () {
    return Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
}
w.screenHeight = function () {
    return Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
}
function easeInOut (t, b, c, d) {
    return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
}


document.addEventListener("DOMContentLoaded", init);

})(this);
