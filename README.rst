Beers and Breweries application using node.
-------------------------------------------

This is a sample web application written with the node.js and couchnode 
library.

We are using couchnode library for accessing couchbase database. Installing
couchnode is not straight forward as it uses libcouchbase_ and a C++ binding to
libcouchbase. Refer to couchnode_ project for installation instructions.

Make sure that you connect with a valid couchbase server and have the
``beer-sample`` bucket installed.  `beer_designs.js` sets up view design docs
used by this application. To setup the additional design documents,

.. code-block:: bash

    node beer.js --setup     // --setup switch will setup the design document.

Following is the gist of what the map function does with `beer` documents,

``beer/by_name``::

    function(doc, meta) {
        if (doc.type && doc.type == "beer") {
            emit(doc.name, null);
        }
    }

Following is the gist of what the map function does with `brewery` documents,

``brewery/by_name``::

    function(doc, meta) {
        if (doc.type && doc.type == "brewery") {
            emit(doc.name, null);
        }
    }


To run the webapp, simply do::

    node beer.js

And connect to ``localhost:1337``

.. _npm: https://npmjs.org/
.. _libcouchbase: https://github.com/couchbase/libcouchbase
.. _couchnode: https://github.com/couchbase/couchnode
