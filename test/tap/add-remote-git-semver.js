var fs = require('fs')
var resolve = require('path').resolve

var osenv = require('osenv')
var mkdirp = require('mkdirp')
var rimraf = require('rimraf')
var test = require('tap').test

var npm = require('../../lib/npm.js')
var common = require('../common-tap.js')

var pkg = resolve(__dirname, 'add-remote-git-semver')
var repo = resolve(__dirname, 'add-remote-git-semver-repo')

var daemon
var daemonPID
var git

var pjParent = JSON.stringify({
  name: 'parent',
  version: '1.2.3',
  dependencies: {
    child: 'git://localhost:1234/child.git#^1.0.0'
  }
}, null, 2) + '\n'

var pjChild = JSON.stringify({
  name: 'child',
  version: '1.0.3'
}, null, 2) + '\n'

test('setup', function (t) {
  bootstrap()
  setup(function (er, r) {
    t.ifError(er, 'git started up successfully')

    if (!er) {
      daemon = r[r.length - 2]
      daemonPID = r[r.length - 1]
    }

    t.end()
  })
})

test('install from repo', function (t) {
  process.chdir(pkg)
  npm.commands.install('.', [], function (er, result) {
    t.ifError(er, 'npm installed via git')
    t.is(result[0][0], 'child@1.0.3')

    t.end()
  })
})

test('clean', function (t) {
  daemon.on('close', function () {
    cleanup()
    t.end()
  })
  process.kill(daemonPID)
})

function bootstrap () {
  mkdirp.sync(pkg)
  fs.writeFileSync(resolve(pkg, 'package.json'), pjParent)
}

function setup (cb) {
  mkdirp.sync(repo)
  fs.writeFileSync(resolve(repo, 'package.json'), pjChild)
  npm.load({ registry: common.registry, loglevel: 'silent' }, function () {
    git = require('../../lib/utils/git.js')

    function startDaemon (cb) {
      // start git server
      var d = git.spawn(
        [
          'daemon',
          '--verbose',
          '--listen=localhost',
          '--export-all',
          '--base-path=.',
          '--reuseaddr',
          '--port=1234'
        ],
        {
          cwd: pkg,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe']
        }
      )
      d.stderr.on('data', childFinder)

      function childFinder (c) {
        var cpid = c.toString().match(/^\[(\d+)\]/)
        if (cpid[1]) {
          this.removeListener('data', childFinder)
          cb(null, [d, cpid[1]])
        }
      }
    }

    common.makeGitRepo({
      path: repo,
      commands: [
        git.chainableExec(
          ['tag', 'v1.0.3'],
          { cwd: repo, env: process.env }
        ),
        git.chainableExec(
          ['clone', '--bare', repo, 'child.git'],
          { cwd: pkg, env: process.env }
        ),
        startDaemon
      ]
    }, cb)
  })
}

function cleanup () {
  process.chdir(osenv.tmpdir())
  rimraf.sync(repo)
  rimraf.sync(pkg)
}
