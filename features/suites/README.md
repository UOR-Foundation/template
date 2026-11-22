# Suites

One Gherkin file per suite, one scenario per conformance ID (R3).

A scenario is tagged with its ID and its honesty level:

```gherkin
Feature: <suite name>

  <what the suite is about, in a sentence.>

  @CX-01 @build
  Scenario: <the statement, copied from model/ids.toml>
    Given <the fixture>
    When prism-code check has Lean's kernel prove <Module.theorem>
    Then <the assertion, in the register's words>
```

The `suite` field of a row in `model/ids.toml` names the file its scenario
lives in. `prism-code check` refuses an ID with no scenario, a scenario whose ID
is not registered, a scenario tagged with another level than its ID's, and a
`build` row whose theorems the model does not state or Lean's kernel does not
prove. A row with `failure` also tags its scenario `@rejects`.

The first capability an app builds starts with a row in `model/ids.toml`, then
a scenario here, then the theorem and acceptance vectors that are its evidence,
in that order, because the order is the discipline (`AGENTS.md`).
