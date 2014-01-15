var beer_app = require('./beer_app');

// connection configuration to pass on to couchbase.connect(). Note that
// while connecting with the server we are also opening the beer-sample
// bucket.
var config = {
    host : [ "localhost:8091" ],
    queryhosts : [ "localhost:8093" ],
    bucket : 'beer-sample'
}

if( require.main == module ) {
    beer_app.start( config );
}
