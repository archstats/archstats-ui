#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <CoreText/CoreText.h>
#import <PDFKit/PDFKit.h>
#include "webprint_darwin.h"
#include "_cgo_export.h"

static WKWebView *findWebView(NSView *view) {
    if ([view isKindOfClass:[WKWebView class]]) return (WKWebView *)view;
    for (NSView *sub in view.subviews) {
        WKWebView *found = findWebView(sub);
        if (found) return found;
    }
    return nil;
}

// The print ends asynchronously; its delegate hands the result back to Go and
// puts the web view's background printing back as it was.
@interface WebprintDelegate : NSObject
@property (nonatomic, weak) WKWebView *webView;
@property (nonatomic) BOOL backgroundsWere;
@end

@implementation WebprintDelegate
- (void)printOperationDidRun:(NSPrintOperation *)op success:(BOOL)success contextInfo:(void *)contextInfo {
    if (@available(macOS 13.3, *)) {
        self.webView.configuration.preferences.shouldPrintBackgrounds = self.backgroundsWere;
    }
    webprintDone((int)(intptr_t)contextInfo, success ? 1 : 0);
}
@end

static WebprintDelegate *delegate;

void webprintPrint(int id, double width, double height, double top, double right, double bottom, double left, const char *path) {
    NSString *file = [NSString stringWithUTF8String:path];
    dispatch_async(dispatch_get_main_queue(), ^{
        WKWebView *webView = nil;
        NSWindow *window = nil;
        for (NSWindow *w in NSApp.windows) {
            webView = findWebView(w.contentView);
            if (webView) { window = w; break; }
        }
        if (!webView) { webprintDone(id, -1); return; }

        NSPrintInfo *info = [[NSPrintInfo sharedPrintInfo] copy];
        info.paperSize = NSMakeSize(width, height);
        info.orientation = NSPaperOrientationPortrait;
        info.topMargin = top;
        info.rightMargin = right;
        info.bottomMargin = bottom;
        info.leftMargin = left;
        info.horizontallyCentered = NO;
        info.verticallyCentered = NO;
        info.horizontalPagination = NSPrintingPaginationModeAutomatic;
        info.verticalPagination = NSPrintingPaginationModeAutomatic;
        info.scalingFactor = 1.0;
        info.jobDisposition = NSPrintSaveJob;
        info.dictionary[NSPrintJobSavingURL] = [NSURL fileURLWithPath:file];
        info.dictionary[NSPrintHeaderAndFooter] = @NO;

        if (!delegate) delegate = [WebprintDelegate new];
        delegate.webView = webView;
        // Tints, rules and the title's orange are backgrounds; they print.
        if (@available(macOS 13.3, *)) {
            delegate.backgroundsWere = webView.configuration.preferences.shouldPrintBackgrounds;
            webView.configuration.preferences.shouldPrintBackgrounds = YES;
        }

        NSPrintOperation *op = [webView printOperationWithPrintInfo:info];
        op.showsPrintPanel = NO;
        op.showsProgressPanel = NO;
        // Without a frame the operation's view prints blank pages.
        op.view.frame = webView.bounds;
        [op runOperationModalForWindow:window
                              delegate:delegate
                        didRunSelector:@selector(printOperationDidRun:success:contextInfo:)
                           contextInfo:(void *)(intptr_t)id];
    });
}

static void drawText(CGContextRef ctx, CTFontRef font, CGColorRef color, NSString *text, CGFloat x, CGFloat baseline, BOOL alignRight) {
    NSDictionary *attrs = @{ (id)kCTFontAttributeName: (__bridge id)font, (id)kCTForegroundColorAttributeName: (__bridge id)color };
    NSAttributedString *s = [[NSAttributedString alloc] initWithString:text attributes:attrs];
    CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)s);
    double w = CTLineGetTypographicBounds(line, NULL, NULL, NULL);
    CGContextSetTextPosition(ctx, alignRight ? x - w : x, baseline);
    CTLineDraw(line, ctx);
    CFRelease(line);
}

int webprintStamp(const char *in, const char *out, const char *title, const void *fontBytes, int fontLen, double marginLeft, double marginRight) {
    @autoreleasepool {
        NSURL *inURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:in]];
        NSURL *outURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:out]];
        NSString *name = [NSString stringWithUTF8String:title];

        CGPDFDocumentRef src = CGPDFDocumentCreateWithURL((__bridge CFURLRef)inURL);
        if (!src) return -1;
        size_t n = CGPDFDocumentGetNumberOfPages(src);
        if (n == 0) { CGPDFDocumentRelease(src); return -2; }
        // Links are annotations; drawing a page does not carry them, so they are set again.
        PDFDocument *annotated = [[PDFDocument alloc] initWithURL:inURL];

        CGRect first = CGPDFPageGetBoxRect(CGPDFDocumentGetPage(src, 1), kCGPDFMediaBox);
        NSDictionary *docInfo = @{ (id)kCGPDFContextTitle: name, (id)kCGPDFContextCreator: @"Archstats Desktop" };
        CGContextRef ctx = CGPDFContextCreateWithURL((__bridge CFURLRef)outURL, &first, (__bridge CFDictionaryRef)docInfo);
        if (!ctx) { CGPDFDocumentRelease(src); return -3; }

        const CGFloat mm = 72.0 / 25.4;
        CTFontRef font = NULL;
        if (fontBytes && fontLen > 0) {
            CGDataProviderRef dp = CGDataProviderCreateWithData(NULL, fontBytes, (size_t)fontLen, NULL);
            CGFontRef cg = CGFontCreateWithDataProvider(dp);
            if (cg) { font = CTFontCreateWithGraphicsFont(cg, 7.5, NULL, NULL); CGFontRelease(cg); }
            CGDataProviderRelease(dp);
        }
        if (!font) font = CTFontCreateUIFontForLanguage(kCTFontUIFontSystem, 7.5, NULL);
        CGColorRef muted = CGColorCreateSRGB(107 / 255.0, 114 / 255.0, 128 / 255.0, 1);

        for (size_t i = 1; i <= n; i++) {
            CGPDFPageRef page = CGPDFDocumentGetPage(src, i);
            CGRect box = CGPDFPageGetBoxRect(page, kCGPDFMediaBox);
            NSDictionary *pageInfo = @{ (id)kCGPDFContextMediaBox: [NSData dataWithBytes:&box length:sizeof(box)] };
            CGPDFContextBeginPage(ctx, (__bridge CFDictionaryRef)pageInfo);
            CGContextDrawPDFPage(ctx, page);

            PDFPage *p = [annotated pageAtIndex:i - 1];
            for (PDFAnnotation *a in p.annotations) {
                if (a.URL) CGPDFContextSetURLForRect(ctx, (__bridge CFURLRef)a.URL, a.bounds);
            }

            // The footer: a hairline 13 mm above the edge, the title and the page number under it.
            CGFloat x0 = box.origin.x + marginLeft, x1 = box.origin.x + box.size.width - marginRight;
            CGFloat rule = box.origin.y + 13 * mm;
            CGContextSaveGState(ctx);
            CGContextSetRGBStrokeColor(ctx, 227 / 255.0, 229 / 255.0, 232 / 255.0, 1);
            CGContextSetLineWidth(ctx, 0.2 * mm);
            CGContextMoveToPoint(ctx, x0, rule);
            CGContextAddLineToPoint(ctx, x1, rule);
            CGContextStrokePath(ctx);
            CGFloat baseline = box.origin.y + 8.2 * mm;
            drawText(ctx, font, muted, name, x0, baseline, NO);
            drawText(ctx, font, muted, [NSString stringWithFormat:@"Page %zu of %zu", i, n], x1, baseline, YES);
            CGContextRestoreGState(ctx);

            CGPDFContextEndPage(ctx);
        }
        CGPDFContextClose(ctx);
        CGContextRelease(ctx);
        CGColorRelease(muted);
        CFRelease(font);
        CGPDFDocumentRelease(src);
        return (int)n;
    }
}
