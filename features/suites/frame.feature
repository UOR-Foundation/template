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
