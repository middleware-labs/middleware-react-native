
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MiddlewareReactNative, NSObject)


RCT_EXTERN_METHOD(initialize:(NSDictionary*)config
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(export:(NSArray*)spans
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(nativeCrash)

RCT_EXTERN_METHOD(setGlobalAttributes:(NSDictionary*)attributes
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setSessionId:(NSString*)sessionId
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
