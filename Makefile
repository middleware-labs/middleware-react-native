PROJECT_NAME = "MiddlewareReactNativeExample"

XCODEBUILD_OPTIONS_IOS = \
	-configuration Debug \
	-destination platform='iOS Simulator,name=iPhone 14,OS=latest' \
	-scheme $(PROJECT_NAME) \
	-workspace MiddlewareReactNativeExample.xcworkspace

.PHONY: setup-brew
setup-brew:
	brew update && brew install xcbeautify

.PHONY: build-ios
build-ios:
	set -o pipefail && cd example/ios &&  xcodebuild $(XCODEBUILD_OPTIONS_IOS) build | xcbeautify

.PHONY: build-for-testing-ios
build-for-testing-ios:
	set -o pipefail && xcodebuild $(XCODEBUILD_OPTIONS_IOS) build-for-testing | xcbeautify

.PHONY: test-ios
test-ios:
	set -o pipefail && xcodebuild $(XCODEBUILD_OPTIONS_IOS) test | xcbeautify

