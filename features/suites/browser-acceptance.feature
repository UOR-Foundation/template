Feature: browser-acceptance

  The shared frame preserves failing acceptance-vector identities without
  disclosing request bytes. Malformed output produces modeled public errors.

  @TC-02 @build
  Scenario: Browser acceptance preserves failure identities and refuses invalid output with modeled diagnostics
    Given the locked shared frame and its browser acceptance validator
    When the Worker replays passing and failing vectors or returns malformed data
    Then failing vector indices are preserved without disclosing request bytes
    And invalid results, identities and count mismatches return distinct registered error codes
    And the complete just vv gate executes positive and negative acceptance tests
