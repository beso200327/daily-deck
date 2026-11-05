#!/usr/bin/env python3
"""Validate committed project structure without requiring Xcode or external modules."""
from pathlib import Path
import json
import plistlib
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
project = ROOT/'DailyDeck.xcodeproj/project.pbxproj'
before = project.read_bytes()
scheme = ROOT/'DailyDeck.xcodeproj/xcshareddata/xcschemes/DailyDeck.xcscheme'
scheme_before = scheme.read_bytes()
subprocess.run(['python3', str(ROOT/'scripts/generate_project.py')], check=True, capture_output=True)
assert project.read_bytes() == before, 'Generated project differs from committed project'
assert scheme.read_bytes() == scheme_before, 'Generated scheme differs from committed scheme'

# Parse the actual OpenStep property list instead of trusting the generator's in-memory graph.
source = re.sub(r'//[^\n]*', '', before.decode())
tokens = re.findall(r'"(?:\\.|[^"\\])*"|[{}()=;,]|[^\s{}()=;,]+', source)
position = 0
def parse():
    global position
    token = tokens[position]; position += 1
    if token == '{':
        result = {}
        while tokens[position] != '}':
            key = parse(); assert tokens[position] == '='; position += 1
            result[key] = parse(); assert tokens[position] == ';'; position += 1
        position += 1
        return result
    if token == '(':
        result = []
        while tokens[position] != ')':
            result.append(parse())
            if tokens[position] == ',': position += 1
            else: assert tokens[position] == ')'
        position += 1
        return result
    return json.loads(token) if token.startswith('"') else token
plist = parse()
assert position == len(tokens)
objects = plist['objects']
root = objects[plist['rootObject']]
assert root['isa'] == 'PBXProject'
assert len(root['targets']) == 3
names = {objects[t]['name']: objects[t] for t in root['targets']}
assert set(names) == {'DailyDeck', 'DailyDeckWidget', 'DailyDeckTests'}
for obj in objects.values():
    if obj['isa'] == 'PBXFileReference' and obj.get('sourceTree') == '<group>':
        assert (ROOT/obj['path']).exists(), obj['path']
    if obj['isa'] == 'PBXBuildFile':
        assert obj.get('fileRef', obj.get('productRef')) in objects
    for key in ['children', 'files', 'buildPhases', 'dependencies', 'buildConfigurations', 'packageProductDependencies']:
        for ref in obj.get(key, []): assert ref in objects, (key, ref)
    if obj['isa'] == 'XCBuildConfiguration' and 'INFOPLIST_FILE' in obj['buildSettings']:
        for key in ['INFOPLIST_FILE', 'CODE_SIGN_ENTITLEMENTS']:
            assert (ROOT/obj['buildSettings'][key]).exists()
app = names['DailyDeck']
assert len(app['dependencies']) == 1
embedding = [objects[x] for x in app['buildPhases'] if objects[x]['isa'] == 'PBXCopyFilesBuildPhase']
assert len(embedding) == 1 and embedding[0]['dstSubfolderSpec'] == '13'
for path in (ROOT/'DailyDeck/Resources').glob('*.plist'):
    with path.open('rb') as f: plistlib.load(f)
groups = []
for path in (ROOT/'DailyDeck/Resources').glob('*.entitlements'):
    with path.open('rb') as f: groups.append(plistlib.load(f)['com.apple.security.application-groups'])
assert groups == [['group.com.dailydeck.shared'], ['group.com.dailydeck.shared']]
assert 'group.com.dailydeck.shared' in (ROOT/'DailyDeck/Core/DeckStore.swift').read_text()
with (ROOT/'DailyDeck/Resources/Widget-Info.plist').open('rb') as f:
    assert plistlib.load(f)['NSExtension']['NSExtensionPointIdentifier'] == 'com.apple.widgetkit-extension'
tree = ET.parse(scheme)
assert len(tree.findall('.//TestableReference')) == 1
assert tree.find('.//TestableReference/BuildableReference').attrib['BlueprintName'] == 'DailyDeckTests'
assert objects[names['DailyDeckTests']['dependencies'][0]]['target'] in root['targets']
for target_name in ['DailyDeck', 'DailyDeckWidget', 'DailyDeckTests']:
    target = names[target_name]
    assert len(target['packageProductDependencies']) == 1
    assert objects[target['packageProductDependencies'][0]]['productName'] == 'DailyDeckCore'
    sources = [objects[phase] for phase in target['buildPhases'] if objects[phase]['isa'] == 'PBXSourcesBuildPhase']
    assert len(sources) == 1 and sources[0]['files']

icon = ROOT/'DailyDeck/Resources/Assets.xcassets/AppIcon.appiconset'
for image in json.loads((icon/'Contents.json').read_text())['images']: assert (icon/image['filename']).exists()
assert len(list((ROOT/'DailyDeck/App').glob('*.swift'))) == 3
assert len(list((ROOT/'DailyDeck/Widget').glob('*.swift'))) == 1
print('PASS: OpenStep project parsing, three targets with native XCTest wiring, source/resource paths, embedded extension, local package wiring, matching App Groups, plists, scheme, icon, and deterministic regeneration.')

# Both executable targets include the declared privacy baseline. Xcode archive review remains required.
privacy_path = ROOT/'DailyDeck/Resources/PrivacyInfo.xcprivacy'
privacy = plistlib.loads(privacy_path.read_bytes())
assert privacy['NSPrivacyTracking'] is False
assert privacy['NSPrivacyCollectedDataTypes'] == []
assert privacy['NSPrivacyAccessedAPITypes'] == []
privacy_refs = {key for key, obj in objects.items() if obj.get('path') == 'DailyDeck/Resources/PrivacyInfo.xcprivacy'}
privacy_builds = {key for key, obj in objects.items() if obj.get('isa') == 'PBXBuildFile' and obj.get('fileRef') in privacy_refs}
for target in (obj for obj in objects.values() if obj.get('isa') == 'PBXNativeTarget' and obj.get('productType') in ['com.apple.product-type.application', 'com.apple.product-type.app-extension']):
    resource_phases = [objects[key] for key in target['buildPhases'] if objects[key]['isa'] == 'PBXResourcesBuildPhase']
    assert any(privacy_builds.intersection(phase['files']) for phase in resource_phases), 'Missing target privacy manifest'
print('Privacy baseline is packaged in app and widget targets; archive SDK report still requires Xcode.')
