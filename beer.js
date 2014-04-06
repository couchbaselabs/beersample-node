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
  argv = process.argv.splice(2);
  if( argv[0] === '--setup' ) {
    beer_app.setup( config );
  } else if( argv[0] === '--reset' ) {
    beer_app.reset( config );
  } else {
    beer_app.start( config );
  }
}
