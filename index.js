(function(bind, undefined) {
    var toString = Object.prototype.toString;
    
    var log = (function() {
        if(typeof console !== "undefined") { return function(text) { console.log(text); }; }
        
        var sys = require("sys");
        return function(text) { sys.puts(text); };
    })();
    
    var retrieveFile, defaultRetrieveFile;
    retrieveFile = defaultRetrieveFile = (function() {
        if(typeof window !== "undefined") { // on client side
            return (function() {
                function xhr() { 
                    return window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest(); 
                }
                
                return function clientFile(path, callback) {
                    var client = xhr();
                    client.open("GET", path);
                    client.onreadystatechange = function() {
                        if(client.readyState !== 4) { return; }
                        
                        callback(client.responseText);
                    };
                    client.send();
                };
            })();
        }
        
        return (function() { // on server side
            var fs = require("fs");
            return function serverFile(path, callback) {
                fs.readFile(path, function(err, data) {
                    if(err) { throw err; }
                    
                    callback(data); 
                });
            };
        })();
    })();
    
    function unescape(val) {
        return val.replace(/\(\\:/g, "(:").replace(/:\\\)/g, ":)")
                  .replace(/\[\\:/g, "[:").replace(/:\\]/g, ":]")
                  .replace(/\{\\:/g, "{:").replace(/:\\}/g, ":}")
                  .replace(/\|\\:/g, "|:").replace(/:\\\|/g, ":|")
                  .replace(/\\\\:/g, "\\:").replace(/:\\\\/g, ":\\")
                  .replace(/\(\^\\:/g, "(^:").replace(/:\\\^\)/g, ":^)");
    }
    
    function levelUp(val) { 
        return val.replace(/\[:/g, "(:").replace(/:]/g, ":)")
                  .replace(/\{:/g, "[:").replace(/:}/g, ":]")
                  .replace(/\|:/g, "{:").replace(/:\|/g, ":}")
                  .replace(/\\:/g, "|:").replace(/:\\/g, ":|");
    }
    
    function binder(tag, context, predefines, callback) {
        if(context == undefined) { callback(""); return; }
        
        var split = tag.match(/\(:\s*(.+?)\s*~\s*([\s\S]+?)\s*:\)/) || [];
        var key = split[1] || tag.match(/\(:\s*(.+?)\s*:\)/)[1], defVal = split[2] || "";
        var val = context[key];
        if(val == undefined) { val = predefines[key]; }
        
        if(val == undefined) { callback(defVal); return; }
        
        if(toString.call(val) === "[object String]") { callback(val); return; }
        
        if(toString.call(val) === "[object Function]") { callback(val(defVal, context).toString()); return; }
        
        if(toString.call(val) === "[object Number]") { callback(val.toString()); return; }
        
        if(toString.call(val) === "[object Boolean]") { callback(val.toString()); return; }
        
        defVal = levelUp(defVal); 
        if(toString.call(val) !== "[object Array]") { bind.to(defVal, val, callback); return; } // isObject
        
        var bindArray = new Array(val.length);
        var fireCallback = (function() {
            var count = val.length;
            
            return function() { if(count-- === 0) { callback(bindArray.join("")); } };
        })();
        for(var i = 0; i < val.length; i++) {
            bind.to(defVal, val[i], (function(i) { 
                return function(data) { bindArray[i] = data; fireCallback(); };
            })(i));
        }
        fireCallback();
    }
    
    var snips = (function() {
        var map = {};
        
        var nextId = (function(id) {
            return function nextId() { return "(^:" + (id++)  + ":^)"; };
        })(0);
        
        function create() {
            var id = nextId();
            return { id: id, callback: function(data) { map[id] = data; } };
        }
        
        function add(data) { 
            var id = nextId();
            map[id] = data;
            return id;
        }
                
        function restore(txt) {
            return txt.replace(/\(\^:\d+?:\^\)/g, function(id) {
                var rtn = map[id]; delete map[id];
                return restore(rtn); 
            });
        }
        
        return { create: create, add: add, restore: restore };
    })();
    
    function toFile(path, context, callback) {
        retrieveFile(path, function(data) { bind.to(data, context, callback); });
    }
    
    function to(template, context, callback) {
        var fileCount = 0;
        
        function file(path, context) {
            var snip = snips.create();
            
            fileCount += 1;
            
            bind.toFile(path, context, function(data) {
                snip.callback(data);
                fileCount -= 1; fireCallback();
            });
            
            return snip.id;
        }
        
        function unboundFile(path, context) {
            var snip = snips.create();
            
            fileCount += 1;
            
            retrieveFile(path, function(data) {
                snip.callback(data);
                fileCount -= 1; fireCallback();
            });
            
            return snip.id;
        }
        
        function fireCallback() {
            if(fileCount > 0) { return; }
            
            if(tagCount > 0) { return; }
            
            callback(snips.restore(unescape(tmp)));
        }
        
        var predefines = { "file": file, "file^": unboundFile };
        // Removed and store escaped blocks
        var tmp = template.replace(/\(\^:([\s\S]+?):\^\)/g, function(_, match) { return snips.add(match); });
        
        var tagCount = 0;
        
        tmp = tmp.replace(/\(:[\s\S]+?:\)/g, function(tag) {
            var snip = snips.create()
            
            tagCount += 1;
            
            setTimeout(function() {
                binder(tag, context, predefines, function(data) {
                    snip.callback(data);
                    tagCount -= 1; fireCallback();
                });
            }, 0);
            
            return snip.id;
        });
        fireCallback(); // Handle the case where no tags or files are found in the template
    }
    
    bind.setFileRetriever = function(retriever) {
        retrieveFile = function() { return retriever.apply({ "default": defaultRetrieveFile }, arguments); }; 
    };
    bind.toFile = toFile;
    bind.to = to;
}) (typeof exports === "object" ? exports : (window.bind = {}));