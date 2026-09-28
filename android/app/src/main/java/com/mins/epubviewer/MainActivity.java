package com.mins.epubviewer;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReaderDocumentsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
