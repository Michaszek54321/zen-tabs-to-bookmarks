# Save zen open tabs into bookmarks

### I made this extention as a replacement for arc browser synchronization. 

Zen doesnt have perfect space and groups synchronization between devices (my laptop and PC) so i figured that if you save all your open tabs to bookmarks then firefox sync will do the rest.

It's not perfect. Zen doesn't have api for reading space and group name so correct spaces are decided on their contents and then named custom ID. Groups are numbered by their order from the top.

It also ignores in saving first 3 tabs from essentials. 

ToDo:
- make a way for controling some options.
- make it open new tabs from other device

### Install
To install either download repo and add it in about:debugging, that way you can edit the code yourself
or
download the .xpi file
go to about:addons
click on 3 dots and install from file and choose the .xpi file
