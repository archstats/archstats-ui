#ifndef WEBPRINT_DARWIN_H
#define WEBPRINT_DARWIN_H

// Prints the app's web view to path on the main thread; webprintDone(id, status)
// follows with 1 when the file is written, 0 when printing failed, -1 when
// there is no web view.
void webprintPrint(int id, double width, double height, double top, double right, double bottom, double left, const char *path);

// Copies the PDF at in to out with the footer on every page (a hairline, the
// title on the left, "Page n of N" on the right) and the title in its info.
// Returns the page count, or a negative number when in cannot be read.
int webprintStamp(const char *in, const char *out, const char *title, const void *font, int fontLen, double marginLeft, double marginRight);

#endif
