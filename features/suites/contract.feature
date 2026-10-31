Feature: contract

  The template's own Prism application, in app/: given the locked and the
  observed SHA-256 digest of each universal policy file, it answers whether the
  repository conforms to the template contract, and which files drifted.

  @TC-01 @build
  Scenario: The checker answers conformant exactly when every universal policy file's observed digest equals its locked digest
    Given the contract model in app/src/Contract.lex.tex
    When the Lean kernel checks conformant_sound and conformant_complete during prismpm verify
    Then conformant is true exactly when each of the six observed digests equals its locked digest
    And the verdict the application returns is decided by that same conformant
