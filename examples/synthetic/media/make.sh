set -e
F="-hide_banner -loglevel error -y"
O="-map_metadata -1 -fflags +bitexact -flags +bitexact"
BOX="color=c=0xf2f0ea:s=96x64:r=12"
X="-t 1 -c:v libx264 -pix_fmt yuv420p -crf 32 -an -movflags +faststart -x264-params threads=1"
ffmpeg $F -f lavfi -i "$BOX,drawbox=x=22:y=16:w=52:h=32:color=0x1c1915:t=3" -frames:v 1 $O panel-box.png
ffmpeg $F -f lavfi -i "$BOX,drawgrid=w=16:h=16:t=2:color=0x1c1915" -frames:v 1 $O panel-grid.png
ffmpeg $F -f lavfi -i "$BOX,drawbox=x=22:y=16:w=52:h=32:color=0x1c1915:t=3" $X $O box-still.mp4
ffmpeg $F -f lavfi -i "$BOX,drawbox=x='22+12*t':y=16:w=52:h=32:color=0x1c1915:t=3" $X $O box-drift.mp4
ffmpeg $F -f lavfi -i "$BOX,drawgrid=w=16:h=16:t=2:color=0x1c1915,boxblur=enable='gte(t,0.5)':luma_radius=3" $X $O grid-blur.mp4
