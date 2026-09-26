package com.vyaparai.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.List;

/** Read-only, grant-protected provider for the verified update APK and app-owned invoice PDFs. */
public final class UpdateApkProvider extends ContentProvider {
    @Override public boolean onCreate(){return true;}

    private File file(Uri uri) throws FileNotFoundException {
        if(getContext()==null || uri==null || !(getContext().getPackageName()+".updates").equals(uri.getAuthority())) {
            throw new FileNotFoundException();
        }
        if("/latest.apk".equals(uri.getPath())) {
            File update=new File(getContext().getFilesDir(),"updates/latest.apk");
            if(!update.isFile())throw new FileNotFoundException();
            return update;
        }
        List<String> segments=uri.getPathSegments();
        if(segments.size()==2 && "share".equals(segments.get(0))) {
            String name=segments.get(1);
            if(name==null || name.isEmpty() || name.contains("/") || name.contains("\\") || !name.toLowerCase(java.util.Locale.US).endsWith(".pdf")) {
                throw new FileNotFoundException();
            }
            try {
                File base=new File(getContext().getFilesDir(),"shares").getCanonicalFile();
                File shared=new File(base,name).getCanonicalFile();
                if(!base.equals(shared.getParentFile()) || !shared.isFile())throw new FileNotFoundException();
                return shared;
            } catch(IOException e) {
                throw new FileNotFoundException();
            }
        }
        throw new FileNotFoundException();
    }

    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        if(!"r".equals(mode))throw new FileNotFoundException("Read-only provider");
        return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri uri){
        return uri!=null && uri.getPath()!=null && uri.getPath().startsWith("/share/") ? "application/pdf" : "application/vnd.android.package-archive";
    }

    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort) {
        try {
            File file=file(uri);
            String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
            MatrixCursor cursor=new MatrixCursor(columns,1);
            Object[] row=new Object[columns.length];
            for(int i=0;i<columns.length;i++){
                if(OpenableColumns.DISPLAY_NAME.equals(columns[i]))row[i]=file.getName();
                else if(OpenableColumns.SIZE.equals(columns[i]))row[i]=file.length();
            }
            cursor.addRow(row);
            return cursor;
        }catch(FileNotFoundException e){return null;}
    }

    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}
    @Override public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException();}
}
