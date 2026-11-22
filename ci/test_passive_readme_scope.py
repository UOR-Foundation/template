"""Planted defects for the passive README classifier; run without SDK/Docker."""
import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

FILE = Path(__file__).with_name("passive_readme_scope.py")
SPEC = importlib.util.spec_from_file_location("passive_readme_scope", FILE)
scope = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scope)

BASE = "# Project\n\n## Section\n\nAn existing section.\n"
VALID = (
    "![Provisional art](assets/readme-banner-PLACEHOLDER.png)\n\n"
    "# Project\n\n[Section](#section) · [Details](details.md)\n\n"
    "## Section\n\nAn edited presentation.\n"
)
IMAGE = b"\x89PNG\r\n\x1a\nsynthetic test image, never production artwork"


class PassiveReadmeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Fixture")
        (self.root / "README.md").write_text(BASE)
        (self.root / "details.md").write_text("# Details\n")
        (self.root / "src").mkdir()
        (self.root / "src" / "model.rs").write_text("pub fn proof() {}\n")
        self.git("add", ".")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.expected = None

    def git(self, *args):
        p = subprocess.run(["git", "-C", str(self.root), *args], check=True,
                           text=True, capture_output=True)
        return p.stdout

    def build(self, text=VALID, image=IMAGE, extra=None, executable=False):
        if text is not None:
            (self.root / "README.md").write_text(text)
        if image is not None:
            (self.root / "assets").mkdir(exist_ok=True)
            (self.root / scope.BANNER).write_bytes(image)
        if extra:
            extra()
        self.git("add", "-A")
        if executable:
            self.git("update-index", "--chmod=+x", "README.md")
        self.git("commit", "-qm", "change")
        self.head = self.git("rev-parse", "HEAD").strip()
        self.expected = self.git("rev-parse", f"HEAD:{scope.BANNER}").strip() if image else "0" * 40

    def check(self, expected=None):
        return scope.qualify(self.root, self.base, self.head,
                             self.expected if expected is None else expected)

    def refuse(self, reason=None, expected=None):
        with self.assertRaises(scope.Refused) as error:
            self.check(expected)
        if reason:
            self.assertIn(reason, str(error.exception))

    def test_passes_two_regular_presentation_paths(self):
        self.build()
        receipt = self.check()
        self.assertEqual(receipt["classification"], "PASSIVE_README")
        self.assertEqual(set(receipt["paths"]), {"README.md", scope.BANNER})
        self.assertEqual(receipt["checked_local_links"], 3)

    def test_rejects_unapproved_png(self):
        self.build()
        self.refuse("unapproved placeholder", "0" * 40)

    def test_rejects_mixed_source_change(self):
        self.build(extra=lambda: (self.root / "src" / "model.rs").write_text("pub fn changed() {}\n"))
        self.refuse("not passive")

    def test_rejects_workflow_change(self):
        def workflow():
            p = self.root / ".github" / "workflows"
            p.mkdir(parents=True)
            (p / "bootstrap.yml").write_text("name: bypass\n")
        self.build(extra=workflow)
        self.refuse("not passive")

    def test_rejects_unknown_doc(self):
        self.build(extra=lambda: (self.root / "docs.md").write_text("extra"))
        self.refuse("not passive")

    def test_rejects_executable_readme(self):
        self.build(executable=True)
        self.refuse("non-regular or executable")

    def test_rejects_symlink_readme(self):
        def symlink():
            (self.root / "README.md").unlink()
            (self.root / "README.md").symlink_to("details.md")
        self.build(extra=symlink)
        self.refuse("not passive: T README.md")

    def test_rejects_broken_anchor(self):
        self.build(VALID.replace("#section", "#missing-anchor"))
        self.refuse("unresolved README anchor")

    def test_rejects_broken_local_target(self):
        self.build(VALID.replace("details.md", "no-such-file.md"))
        self.refuse("missing or non-regular link target")

    def test_rejects_traversal(self):
        self.build(VALID.replace("details.md", "../secret.md"))
        self.refuse("escapes repository")

    def test_rejects_generated_source_header(self):
        self.build("<!-- @generated from canonical model -->\n" + VALID)
        self.refuse("source-owned generated")

    def test_rejects_modified_generated_region(self):
        old = BASE + "\n<!-- BEGIN release-targets -->\nverified: false\n<!-- END release-targets -->\n"
        (self.root / "README.md").write_text(old)
        self.git("add", "README.md")
        self.git("commit", "-qm", "model baseline")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.build(VALID + "\n<!-- BEGIN release-targets -->\nverified: true\n<!-- END release-targets -->\n")
        self.refuse("generated or release-controlled")

    def test_rejects_removed_protected_region(self):
        old = BASE + "\n<!-- BEGIN release-targets -->\nverified: false\n<!-- END release-targets -->\n"
        (self.root / "README.md").write_text(old)
        self.git("add", "README.md")
        self.git("commit", "-qm", "model baseline")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.build(VALID)
        self.refuse("generated or release-controlled")

    def test_rejects_missing_base(self):
        self.build()
        with self.assertRaises(scope.Refused):
            scope.qualify(self.root, "1" * 40, self.head, self.expected)

    def test_rejects_mismatched_head(self):
        self.build()
        with self.assertRaises(scope.Refused):
            scope.qualify(self.root, self.base, self.base, self.expected)

    def test_rejects_no_readme_change(self):
        self.build(text=None)
        self.refuse("no README change")

    def test_rejects_renamed_readme(self):
        def rename():
            (self.root / "README.md").rename(self.root / "OLD-README.md")
        self.build(text=None, extra=rename)
        self.refuse("not passive")

    def test_rejects_asset_alone_or_delete(self):
        self.build(text=None, image=IMAGE)
        self.refuse("no README change")

    def test_rejects_newly_injected_policy_marker(self):
        self.build(VALID + "\n<!-- BEGIN release-targets -->\nfalse\n<!-- END release-targets -->\n")
        self.refuse("generated or release-controlled")


if __name__ == "__main__":
    unittest.main()
