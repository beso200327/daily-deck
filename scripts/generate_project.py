#!/usr/bin/env python3
"""Generate a dependency-free Xcode project; core is a local Swift package."""
import hashlib
import pathlib
import re
ROOT = pathlib.Path(__file__).resolve().parents[1]
objects = {}
def uid(name): return hashlib.sha256(name.encode()).hexdigest()[:24].upper()
def add(identity, **fields):
    key = uid(identity)
    objects[key] = fields
    return key
def render(value, depth=0):
    indent = '\t' * depth
    child = '\t' * (depth + 1)
    if isinstance(value, dict):
        return '{\n' + ''.join(f'{child}{k} = {render(v, depth+1)};\n' for k,v in value.items()) + indent + '}'
    if isinstance(value, list):
        return '(\n' + ''.join(f'{child}{render(x, depth+1)},\n' for x in value) + indent + ')'
    value = str(value)
    return value if re.fullmatch(r'[A-Za-z0-9_./]+', value) else '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
def configs(name, settings):
    refs = []
    for mode in ['Debug', 'Release']:
        merged = dict(settings)
        merged.update(SWIFT_OPTIMIZATION_LEVEL='-Onone' if mode == 'Debug' else '-O', DEBUG_INFORMATION_FORMAT='dwarf' if mode == 'Debug' else 'dwarf-with-dsym')
        if mode == 'Debug':
            merged['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = 'DEBUG'
            merged['ENABLE_TESTABILITY'] = 'YES'
        refs.append(add(name+mode, isa='XCBuildConfiguration', name=mode, buildSettings=merged))
    return add(name+'configs', isa='XCConfigurationList', buildConfigurations=refs, defaultConfigurationIsVisible=0, defaultConfigurationName='Release')
package = add('localpackage', isa='XCLocalSwiftPackageReference', relativePath='.')
products = []
sourcegroups = []
targets = []
for name, folder, extension, bundle, plist, ent in [
    ('DailyDeckWidget', 'Widget', 'appex', 'com.dailydeck.app.widget', 'Widget-Info.plist', 'Widget.entitlements'),
    ('DailyDeck', 'App', 'app', 'com.dailydeck.app', 'App-Info.plist', 'App.entitlements')]:
    refs = []
    builds = []
    for path in sorted((ROOT/'DailyDeck'/folder).glob('*.swift')):
        ref = add(str(path.relative_to(ROOT)), isa='PBXFileReference', lastKnownFileType='sourcecode.swift', path=str(path.relative_to(ROOT)), sourceTree='<group>')
        refs.append(ref)
        builds.append(add(name+path.name+'build', isa='PBXBuildFile', fileRef=ref))
    sourcegroups.append(add(folder+'group', isa='PBXGroup', name=folder, children=refs, sourceTree='<group>'))
    prod = add(name+'product', isa='PBXFileReference', explicitFileType='wrapper.application' if extension == 'app' else 'wrapper.app-extension', includeInIndex=0, path=name+'.'+extension, sourceTree='BUILT_PRODUCTS_DIR')
    products.append(prod)
    dep = add(name+'core', isa='XCSwiftPackageProductDependency', package=package, productName='DailyDeckCore')
    lib = add(name+'corebuild', isa='PBXBuildFile', productRef=dep)
    resourcebuilds = []
    if extension == 'app':
        assets = add('assets', isa='PBXFileReference', lastKnownFileType='folder.assetcatalog', path='DailyDeck/Resources/Assets.xcassets', sourceTree='<group>')
        sourcegroups.append(add('assetsgroup', isa='PBXGroup', name='Resources', children=[assets], sourceTree='<group>'))
        resourcebuilds.append(add('assetsbuild', isa='PBXBuildFile', fileRef=assets))
    phases = [add(name+'sources', isa='PBXSourcesBuildPhase', buildActionMask=2147483647, files=builds, runOnlyForDeploymentPostprocessing=0), add(name+'frameworks', isa='PBXFrameworksBuildPhase', buildActionMask=2147483647, files=[lib], runOnlyForDeploymentPostprocessing=0), add(name+'resources', isa='PBXResourcesBuildPhase', buildActionMask=2147483647, files=resourcebuilds, runOnlyForDeploymentPostprocessing=0)]
    dependencies = []
    if extension == 'app':
        proxy = add('widgetproxy', isa='PBXContainerItemProxy', containerPortal=uid('project'), proxyType=1, remoteGlobalIDString=uid('DailyDeckWidgettarget'), remoteInfo='DailyDeckWidget')
        dependencies = [add('widgetdependency', isa='PBXTargetDependency', target=uid('DailyDeckWidgettarget'), targetProxy=proxy)]
        embed = add('embedwidget', isa='PBXBuildFile', fileRef=uid('DailyDeckWidgetproduct'), settings={'ATTRIBUTES': ['RemoveHeadersOnCopy']})
        phases.append(add('embedphase', isa='PBXCopyFilesBuildPhase', buildActionMask=2147483647, dstPath='', dstSubfolderSpec=13, files=[embed], name='Embed App Extensions', runOnlyForDeploymentPostprocessing=0))
    settings = dict(PRODUCT_NAME='$(TARGET_NAME)', PRODUCT_BUNDLE_IDENTIFIER=bundle, INFOPLIST_FILE='DailyDeck/Resources/'+plist, CODE_SIGN_ENTITLEMENTS='DailyDeck/Resources/'+ent, CODE_SIGN_STYLE='Automatic', SWIFT_VERSION='5.0', IPHONEOS_DEPLOYMENT_TARGET='17.0', SDKROOT='iphoneos', TARGETED_DEVICE_FAMILY='1', GENERATE_INFOPLIST_FILE='NO', CURRENT_PROJECT_VERSION='1', MARKETING_VERSION='1.0', LD_RUNPATH_SEARCH_PATHS=['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks'])
    if extension == 'app': settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
    if extension == 'appex': settings.update(APPLICATION_EXTENSION_API_ONLY='YES', SKIP_INSTALL='YES')
    targets.append(add(name+'target', isa='PBXNativeTarget', buildConfigurationList=configs(name, settings), buildPhases=phases, buildRules=[], dependencies=dependencies, name=name, productName=name, productReference=prod, productType='com.apple.product-type.application' if extension == 'app' else 'com.apple.product-type.app-extension', packageProductDependencies=[dep]))
# Native XCTest bundle is hosted by the app so Cmd-U exercises the same core on iOS.
testrefs, testbuilds = [], []
for path in sorted((ROOT/'Tests').glob('*.swift')):
    ref = add(str(path.relative_to(ROOT)), isa='PBXFileReference', lastKnownFileType='sourcecode.swift', path=str(path.relative_to(ROOT)), sourceTree='<group>')
    testrefs.append(ref)
    testbuilds.append(add(path.name+'testbuild', isa='PBXBuildFile', fileRef=ref))
sourcegroups.append(add('testsgroup', isa='PBXGroup', name='Tests', children=testrefs, sourceTree='<group>'))
testproduct = add('testproduct', isa='PBXFileReference', explicitFileType='wrapper.cfbundle', includeInIndex=0, path='DailyDeckTests.xctest', sourceTree='BUILT_PRODUCTS_DIR')
products.append(testproduct)
testcore = add('testcore', isa='XCSwiftPackageProductDependency', package=package, productName='DailyDeckCore')
testlib = add('testcorebuild', isa='PBXBuildFile', productRef=testcore)
testproxy = add('testhostproxy', isa='PBXContainerItemProxy', containerPortal=uid('project'), proxyType=1, remoteGlobalIDString=uid('DailyDecktarget'), remoteInfo='DailyDeck')
testdep = add('testhostdependency', isa='PBXTargetDependency', target=uid('DailyDecktarget'), targetProxy=testproxy)
testsettings = dict(PRODUCT_NAME='$(TARGET_NAME)', PRODUCT_BUNDLE_IDENTIFIER='com.dailydeck.app.tests', GENERATE_INFOPLIST_FILE='YES', CODE_SIGN_STYLE='Automatic', SWIFT_VERSION='5.0', IPHONEOS_DEPLOYMENT_TARGET='17.0', SDKROOT='iphoneos', TARGETED_DEVICE_FAMILY='1', TEST_HOST='$(BUILT_PRODUCTS_DIR)/DailyDeck.app/DailyDeck', BUNDLE_LOADER='$(TEST_HOST)', ENABLE_TESTING_SEARCH_PATHS='YES', LD_RUNPATH_SEARCH_PATHS=['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks'])
testphases = [add('testsources', isa='PBXSourcesBuildPhase', buildActionMask=2147483647, files=testbuilds, runOnlyForDeploymentPostprocessing=0), add('testframeworks', isa='PBXFrameworksBuildPhase', buildActionMask=2147483647, files=[testlib], runOnlyForDeploymentPostprocessing=0)]
targets.append(add('testtarget', isa='PBXNativeTarget', buildConfigurationList=configs('tests', testsettings), buildPhases=testphases, buildRules=[], dependencies=[testdep], name='DailyDeckTests', productName='DailyDeckTests', productReference=testproduct, productType='com.apple.product-type.bundle.unit-test', packageProductDependencies=[testcore]))
productgroup = add('productsgroup', isa='PBXGroup', name='Products', children=products, sourceTree='<group>')
main = add('main', isa='PBXGroup', children=sourcegroups+[productgroup], sourceTree='<group>')
project = add('project', isa='PBXProject', attributes={'BuildIndependentTargetsInParallel':'YES', 'LastUpgradeCheck':'1600'}, buildConfigurationList=configs('project', {'CLANG_ENABLE_MODULES':'YES', 'SWIFT_VERSION':'5.0'}), compatibilityVersion='Xcode 14.0', developmentRegion='en', hasScannedForEncodings=0, knownRegions=['en', 'Base'], mainGroup=main, productRefGroup=productgroup, projectDirPath='', projectRoot='', targets=targets, packageReferences=[package])
projectdir = ROOT/'DailyDeck.xcodeproj'
projectdir.mkdir(exist_ok=True)
(projectdir/'project.pbxproj').write_text('// !$*UTF8*$!\n'+render({'archiveVersion':1, 'classes':{}, 'objectVersion':56, 'objects':objects, 'rootObject':project})+'\n')
schemes = projectdir/'xcshareddata/xcschemes'
schemes.mkdir(parents=True, exist_ok=True)
(schemes/'DailyDeck.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid('DailyDecktarget')}" BuildableName="DailyDeck.app" BlueprintName="DailyDeck" ReferencedContainer="container:DailyDeck.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid('testtarget')}" BuildableName="DailyDeckTests.xctest" BlueprintName="DailyDeckTests" ReferencedContainer="container:DailyDeck.xcodeproj"/></TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid('DailyDecktarget')}" BuildableName="DailyDeck.app" BlueprintName="DailyDeck" ReferencedContainer="container:DailyDeck.xcodeproj"/></BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"/>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''')
if __name__ == '__main__': print('Generated DailyDeck.xcodeproj (app + embedded WidgetKit extension + XCTest target + local core package).')
