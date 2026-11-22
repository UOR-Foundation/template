Feature: passive-readme

  The task-owned passive README classifier is a candidate for a future
  universal qualification tier, not a current substitute for just vv.

  @RD-01 @build
  Scenario: The passive README classifier accepts a verified presentation-only diff and refuses unsupported paths, changed generated regions, and unsafe references
    Given an isolated Git history with an approved placeholder PNG and a README
    When the passive-readme planted test suite compares trusted base and exact head
    Then a regular README and PNG presentation change qualifies without product acceptance
    And mixed source, symlink, generated-region, image and broken-link changes require full verification
