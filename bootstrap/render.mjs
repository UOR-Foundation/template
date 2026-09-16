import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createPlatformLock } from "/opt/prismpm/platform-lock.mjs";
import { bindStandardsLock } from "./standards-lock.mjs";

const [sdkImage, actionReference, templateRevision, platformDirectory] = process.argv.slice(2);
const immutableImage = /^[a-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9./_-]+@sha256:[0-9a-f]{64}$/;
const immutableAction = /^UOR-Foundation\/PrismPM\/action@[0-9a-f]{40}$/;
const revision = /^[0-9a-f]{40}$/;

if (
  !immutableImage.test(sdkImage) ||
  !immutableAction.test(actionReference) ||
  !revision.test(templateRevision)
) {
  throw new Error("bootstrap identities must be immutable lowercase digests");
}
const registryPort = sdkImage.split('/', 1)[0].split(':', 2)[1];
if (registryPort !== undefined && (Number(registryPort) < 1 || Number(registryPort) > 65535)) {
  throw new Error("SDK image registry port is outside 1..65535");
}

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};

const encode = (value) => JSON.stringify(canonical(value));
const sha = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const readCanonicalJson = async (path) => {
  const bytes = await readFile(path);
  const value = JSON.parse(bytes);
  const text = bytes.toString("utf8");
  if (encode(value) !== text && `${encode(value)}\n` !== text) {
    throw new Error(`${path} is not canonical JSON`);
  }
  return { bytes, value };
};

if (platformDirectory !== "/sdk-platforms") throw new Error("SDK platform extraction bundle is required");
const inventory = await readFile("/opt/prismpm/share/inventory.json");
const standards = await readFile("/opt/prismpm/share/standards.lock");
const platformLock = await createPlatformLock(platformDirectory, sdkImage, inventory, standards, process.arch);
await bindStandardsLock("/workspace/standards.lock", standards);
let previousSdkImage;
try {
  const previousSdkLock = JSON.parse(await readFile("/workspace/prismpm.lock", "utf8"));
  if (immutableImage.test(previousSdkLock.sdk_image ?? "")) {
    previousSdkImage = previousSdkLock.sdk_image;
  }
} catch (error) {
  if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
}
const contract = await readCanonicalJson("/workspace/template-contract.json");
const policyPaths = contract.value.universal_policy_paths;
const requiredPolicyPaths = [
  ".devcontainer/devcontainer.json",
  ".github/workflows/bootstrap.yml",
  "AGENTS.md",
  "VERIFICATION.md",
  "prismpm.lock",
  "template-contract.json",
  "template.lock",
];
const projectContentPaths = ["CONFORMANCE.md"];
const requiredPaths = [...requiredPolicyPaths, ...projectContentPaths].sort((left, right) =>
  Buffer.from(left).compare(Buffer.from(right)),
);
const contractKeys = Object.keys(contract.value).sort();
if (
  contract.value.schema !== "uor/template-contract/1" ||
  contract.value.version !== "1.0.0" ||
  contractKeys.join("\n") !==
    [
      "project_content_paths",
      "required_paths",
      "schema",
      "universal_policy_paths",
      "version",
    ].join("\n") ||
  !Array.isArray(policyPaths) ||
  policyPaths.join("\n") !== requiredPolicyPaths.join("\n") ||
  !Array.isArray(contract.value.project_content_paths) ||
  contract.value.project_content_paths.join("\n") !== projectContentPaths.join("\n") ||
  !Array.isArray(contract.value.required_paths) ||
  contract.value.required_paths.join("\n") !== requiredPaths.join("\n")
) {
  throw new Error("template contract does not match uor/template-contract/1");
}
const sdkLock = encode(platformLock);
const devcontainer = `${JSON.stringify(
  {
    name: "UOR PrismPM SDK",
    image: sdkImage,
    containerUser: "root",
    workspaceMount: "source=${localWorkspaceFolder},target=${localWorkspaceFolder},type=bind",
    workspaceFolder: "${localWorkspaceFolder}",
    initializeCommand: 'mkdir -p "${localEnv:HOME}/.docker" && if test ! -f "${localEnv:HOME}/.docker/config.json"; then printf "{}\\n" > "${localEnv:HOME}/.docker/config.json"; fi',
    remoteUser: "vscode",
    mounts: [
      "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind",
      "source=${localEnv:HOME}/.docker/config.json,target=/home/vscode/.docker/config.json,type=bind,readonly",
    ],
    overrideCommand: false,
    runArgs: ["--init", "--entrypoint", "prismpm-devcontainer-init"],
    customizations: {
      vscode: {
        extensions: ["leanprover.lean4", "rust-lang.rust-analyzer"],
        settings: {
          "[rust]": { "editor.defaultFormatter": "rust-lang.rust-analyzer" },
          "editor.formatOnSave": true,
          "files.watcherExclude": { "**/target/**": true },
          "rust-analyzer.cargo.allFeatures": true,
          "rust-analyzer.check.command": "clippy",
          "rust-analyzer.procMacro.enable": true,
          "search.exclude": { "**/target": true },
        },
      },
    },
    postCreateCommand: "prismpm template check && prismpm lock check && just vv",
  },
  null,
  2,
)}\n`;
const workflowNames = (await readdir("/workspace/.github/workflows"))
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
let actionMarkers = 0;
for (const name of workflowNames) {
  const path = `.github/workflows/${name}`;
  const source = await readFile(`/workspace/${path}`, "utf8");
  const marker = "# prismpm-action-input";
  let renderedWorkflow = source
    .split("\n")
    .map((line) => {
      if (!line.includes(marker)) return line;
      const match = /^(\s*)uses:\s+\S+\s+# prismpm-action-input$/.exec(line);
      if (!match) throw new Error(`${path} has a malformed PrismPM action marker`);
      actionMarkers += 1;
      return `${match[1]}uses: ${actionReference} ${marker}`;
    })
    .join("\n");
  renderedWorkflow = renderedWorkflow
    .replaceAll(
      "UOR-Foundation/PrismPM/action@__PRISMPM_ACTION_COMMIT__",
      actionReference,
    )
    .replace(
      /UOR-Foundation\/PrismPM\/action@[0-9a-f]{40}/g,
      actionReference,
    )
    .replaceAll("__PRISMPM_SDK_IMAGE__", sdkImage);
  if (previousSdkImage) {
    renderedWorkflow = renderedWorkflow.replaceAll(previousSdkImage, sdkImage);
  }
  if (/__PRISMPM_(?:ACTION_COMMIT|SDK_IMAGE)__/.test(renderedWorkflow)) {
    throw new Error(`${path} retains an unresolved PrismPM release identity`);
  }
  if (renderedWorkflow !== source) {
    await writeFile(`/workspace/${path}`, renderedWorkflow);
  }
}
if (actionMarkers === 0) throw new Error("workflows have no shared PrismPM action input marker");
const rendered = new Map([
  [".devcontainer/devcontainer.json", Buffer.from(devcontainer)],
  ["prismpm.lock", Buffer.from(sdkLock)],
  ["template-contract.json", contract.bytes],
]);
const policyFiles = [];
for (const path of policyPaths) {
  if (path === "template.lock") continue;
  const bytes = rendered.get(path) ?? (await readFile(`/workspace/${path}`));
  policyFiles.push({ path, sha256: sha(bytes) });
}
const templateLock = encode({
  contract_digest: sha(contract.bytes),
  policy_files: policyFiles,
  policy_tree_sha256: sha(Buffer.from(encode(policyFiles))),
  schema: "uor/template-lock/1",
  sdk_image: sdkImage,
  template_repository: "https://github.com/UOR-Foundation/template",
  template_revision: templateRevision,
});

await Promise.all([
  writeFile("/workspace/prismpm.lock", sdkLock),
  writeFile("/workspace/template.lock", templateLock),
  writeFile("/workspace/.devcontainer/devcontainer.json", devcontainer),
]);
