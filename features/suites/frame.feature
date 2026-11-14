Feature: frame

  The frame delegates archive verification and execution to the same worker,
  retaining the locked prism-code runtime as the verification authority.

  @FR-01 @build
  Scenario: With a working worker, the page loads and verifies the archive only in that worker before using its identities or guest
    Given the production page and its module worker with the locked runtime
    When the page loads an archive by its absolute URL
    Then the worker loads and verifies the archive before returning its identities
    And the page never loads, resolves or compiles the archive on the working-worker path
    And dispatch and acceptance use that same worker-owned verified application
    And a runtime refusal retains its code and cannot publish verified identities
    And absent workers retain the existing fully verified online execution path
    And failed worker initialization retains the existing fully verified online execution path
    And a crashed initialized worker rejects every waiting call without executing an unverified guest
    And frame.worker reports transport failure without retrying calls after initialization
    And frame.worker.not-ready refuses dispatch or acceptance before loading completes
    And frame.worker.initialized refuses repeated initialization
    And frame.worker.not-verified refuses use of unverified identities
    And frame.worker.request refuses an unknown operation
    And runtime archive rejection codes are final and never trigger page-side fallback
    And all nineteen production-module controls execute without skips, filtering or cancellation
    And module workers resolve the same browser crypto adapter without a document import map
    And every runtime module keeps its locked bytes except that one import specifier
    And an unknown bare import refuses worker runtime assembly
    And fresh scaffold rendering packages from the explicit locked source without requiring a staged vendor directory

  @FR-02 @build
  Scenario: A returning browser whose worker kept an earlier deploy serves this deploy from the navigation that brings its page
    Given the production service worker with a browser's caches and network stood in
    And a browser whose worker kept an earlier deploy, while the network serves a newer one
    When the page is navigated to
    Then the navigation asks precache.json for the deploy's version
    And a version the worker does not keep becomes its cache before the page is answered
    And the page's modules then come from this deploy, not the kept one
    And the earlier deploy's cache is dropped
    And the same deploy is served from its cache without fetching a kept file again
    And offline, the kept deploy answers the navigation and stays
    And navigations at the same time move to the new deploy once
    And a fresh install keeps its deploy and later navigations do not move it

  @FR-03 @build
  Scenario: A first visit's bytes are counted once the page has started, the frame's and the app's each within its own budget
    Given a first visit to the assembled site on a phone, with no service worker
    When the canonical frame is running and the shield has replayed every example, and the network is quiet
    Then every byte over the wire is counted, the page's workers included
    And the frame's host, the frame-locked site files, the fonts and the worker runtime count as the frame's
    And everything else counts as the app's
    And the frame's bytes, the app's bytes and the requests are each held to their own budget
    And a blob or data URL is not counted again
